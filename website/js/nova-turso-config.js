/* Public browser-side Turso configuration.
 * This credential is intentionally browser-visible for the public database.
 * Treat it as public: anyone can extract it and use its granted database access.
 * Do not use this configuration for private or privileged NOVA data.
 */
(function (global) {
  "use strict";
  global.NOVA_TURSO_CONFIG = Object.freeze({
    url: "https://public2-nova-db-nexuswebprod.aws-us-east-2.turso.io",
    authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTI1NTQxNzgsImlkIjoiMDFhMTVjOGMtYjgwMS03MjE0LThmNjItZDllMDBlZjljYjk4Iiwia2lkIjoiUjFRX01ZWGxFMnQtdDRFMGU5dXAwZHZQWEJCRWR1R2dUdmI5YWVpeG05cyIsInJpZCI6ImMxZmY0ZDcyLTRlNDYtNGFlZS05MWYxLTlhYWM5MzkwY2ZjMyJ9.qjImDTWq6D5vUpSalsMwnI1AtQ3qcwIsUKTR8dOr3Z5KH6yvvL-ZOYSVVOA--OnlKKQN6y3RBTjy-u4BqR8cDg"
  });
})(window);
