import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { PrismaService } from '../database/prisma.service.js';
import { LineApiClient } from './line-api.client.js';

/**
 * Keeps each LINE user's rich menu in line with `rich_menu_state`: guests see the sign-up menu, linked members the
 * member menu. A failed sync never undoes a valid signup or link; the next tick tries again.
 */
@Injectable()
export class RichMenus {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LineApiClient) private readonly api: LineApiClient,
    @Inject(APP_CONFIG) private readonly config: ApplicationConfig,
  ) {}
  async sync(organizationId: string, lineAccountId: string): Promise<boolean> {
    const account = await this.db.lineAccount.findFirst({ where: { organizationId, id: lineAccountId } });
    if (!account) return true;
    const desired = account.richMenuState;
    let ok = true;
    if (this.config.line && account.reachable) {
      const member = desired === 'member' && this.config.line.richMenuMemberId;
      ok = member ? await this.api.linkRichMenu(account.lineUserId, member) : await this.api.unlinkRichMenu(account.lineUserId);
    }
    if (ok) await this.db.lineAccount.updateMany({ where: { id: account.id, richMenuState: desired }, data: { richMenuSyncedState: desired } });
    return ok;
  }
  /** Retries every account whose desired menu differs from the last one confirmed with LINE. */
  async syncPending(limit = 20): Promise<number> {
    const rows = await this.db.$queryRaw<Array<{ organization_id: string; id: string }>>`SELECT organization_id, id FROM line_accounts WHERE rich_menu_state <> rich_menu_synced_state LIMIT ${limit}`;
    let done = 0;
    for (const row of rows) if (await this.sync(row.organization_id, row.id).catch(() => false)) done += 1;
    return done;
  }
}
