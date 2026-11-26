// The deployed admin usage endpoint. Bundled into dist/admin-usage.mjs, which
// api/admin-usage.js re-exports.
import { adminGuard } from '../../api/_lib/adminGuard.js';
import { selectMany } from '../../api/_lib/supabaseAdmin.js';
import { createAdminUsageHandler } from '../adminUsage.ts';
import { budgetLimit } from '../budget.ts';

const handler = createAdminUsageHandler({
  guard: (req, res) => adminGuard(req, res, { methods: ['GET'] }),
  select: selectMany,
  dailyLimitUsd: budgetLimit(process.env.DAILY_BUDGET_USD),
});

export default handler;
