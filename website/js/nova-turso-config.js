/* Public browser-side Turso configuration.
 * Never commit a live Turso auth token here. Browser-visible Turso tokens
 * grant database-level access and are not restricted by table-level policies.
 * Direct SQL stays disabled until the database access model is safe for public
 * clients; use a provider with enforceable per-user/table authorization or a
 * separately scoped public database that contains no private data.
 */
(function (global) {
  "use strict";
  global.NOVA_TURSO_CONFIG = Object.freeze({
    url: "https://public-nova-db-nexuswebprod.aws-us-east-2.turso.io",
    authToken: ""
  });
})(window);
