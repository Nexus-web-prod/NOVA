/* Public browser-side Turso configuration.
 * This credential is intentionally browser-visible for the public database.
 * Treat it as public: anyone can extract it and use its granted database access.
 * Do not use this configuration for private or privileged NOVA data.
 */
(function (global) {
  "use strict";
  global.NOVA_TURSO_CONFIG = Object.freeze({
    url: "https://public-nova-db-nexuswebprod.aws-us-east-2.turso.io",
    authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTI1NTE2NDMsImlkIjoiMDFhMTU1ODgtMzIwMS03NzUyLWI1MzEtMTM1MWU5MWUyMTIyIiwia2lkIjoiUjFRX01ZWGxFMnQtdDRFMGU5dXAwZHZQWEJCRWR1R2dUdmI5YWVpeG05cyIsInJpZCI6IjE2NWJhMTFhLWJlZjYtNDlhMS04OTMwLTA2NmNkMTM5NjU2OCJ9.hFSbtGdTLBp2jkVzieKJ4LniiVqNFEJCX2w4ObBXxFsV7G4SfxoDbpuIejmmzq8dMfml1YulpVlBD2Zf9qHJCQ"
  });
})(window);
