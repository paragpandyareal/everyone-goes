// S0. Print which OAuth scopes each app token has (no secrets). Checks the dashboard features were ticked.
import { scopes } from './lib.mjs';
for (const app of ['trips', 'coverfund']) {
  try {
    const s = (await scopes(app)).split(' ');
    const has = (re) => (s.some((x) => re.test(x)) ? 'yes' : 'NO');
    console.log(`${app}: ${s.length} scopes. invoicing ${has(/invoic/)}, vault ${has(/vault\/payment-tokens/)}, payouts ${has(/payouts/)}, reporting ${has(/reporting/)}`);
  } catch (e) { console.log(`${app}: ${e.message}`); }
}
