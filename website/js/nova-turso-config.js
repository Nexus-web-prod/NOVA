/* Public browser-side Turso configuration.
 * Replace the placeholder with a token for public-nova-db before enabling
 * direct database operations. This file is intentionally client-visible.
 */
(function (global) {
  "use strict";
  global.NOVA_TURSO_CONFIG = Object.freeze({
    url: "https://public-nova-db-nexuswebprod.aws-us-east-2.turso.io",
    authToken: "YOUR PUBLIC DATABASE TOKEN"
  });
})(window);
