/* Public browser-side Turso configuration.
 * Never place a broad read/write database token in client-visible code.
 * Direct browser access stays disabled until Turso has a deliberately scoped
 * public credential with only the operations and tables intended for clients.
 */
(function (global) {
  "use strict";
  global.NOVA_TURSO_CONFIG = Object.freeze({
    url: "https://public-nova-db-nexuswebprod.aws-us-east-2.turso.io",
    authToken: ""
  });
})(window);
