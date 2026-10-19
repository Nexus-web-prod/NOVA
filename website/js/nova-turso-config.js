/* Public browser-side Turso configuration.
 * Replace the placeholder with a token for public-nova-db before enabling
 * direct database operations. This file is intentionally client-visible.
 */
(function (global) {
  "use strict";
  global.NOVA_TURSO_CONFIG = Object.freeze({
    url: "https://public-nova-db-nexuswebprod.aws-us-east-2.turso.io",
    authToken: "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTI0Mzg2MjAsImlkIjoiMDFhMTU1ODgtMzIwMS03NzUyLWI1MzEtMTM1MWU5MWUyMTIyIiwia2lkIjoiUjFRX01ZWGxFMnQtdDRFMGU5dXAwZHZQWEJCRWR1R2dUdmI5YWVpeG05cyIsInJpZCI6IjE2NWJhMTFhLWJlZjYtNDlhMS04OTMwLTA2NmNkMTM5NjU2OCJ9.7iQ_6eltbtBd1VUw5bxRWKnyzO-dhjHYnG6cCh1zbGHw86_BlfZfXRw_Ey7PlmimoZxYPjsnhCpdM3zkvCk6Cg"
  });
})(window);
