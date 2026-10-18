import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsString, IsUUID } from 'class-validator';
import { Body, Controller, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles, type StaffRequest } from '../auth/auth.guard.js';
import { validatedBody } from '../common/validation.js';
import { Forms } from './forms.service.js';

class SignupFormDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique() @IsUUID('4', { each: true })
  memberIds!: string[];
}
class SignatureReceiptDto {
  @IsString() receivedAt!: string;
}

@Roles('admin', 'staff')
@Controller()
export class FormsController {
  constructor(@Inject(Forms) private readonly forms: Forms) {}
  @Post('forms/signup') @HttpCode(200)
  async print(
    @Req() req: StaffRequest,
    @Body(validatedBody(SignupFormDto)) input: SignupFormDto,
    @Res() response: Response,
  ): Promise<void> {
    const pdf = await this.forms.renderSignup(req.actor, input.memberIds);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'inline; filename="familylink-signup.pdf"');
    response.end(pdf);
  }
  @Post('members/:id/signature-receipt') @HttpCode(200)
  receipt(
    @Req() req: StaffRequest,
    @Param('id') memberId: string,
    @Body(validatedBody(SignatureReceiptDto)) input: SignatureReceiptDto,
  ) {
    return this.forms.markSigned(req.actor, memberId, input.receivedAt);
  }
}
