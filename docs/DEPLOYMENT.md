# Deployment

`scripts/deploy/deploy-pages-turso.sh` is the deployment entry point. It verifies the Turso
secret, optionally deploys the voice coordinator, builds a temporary allowlist
bundle, excludes internal admin modules and source maps, then deploys through
Cloudflare Pages.

For the normal release workflow, run `scripts/deploy/deploy.sh`. It deploys the
selected production or branch-preview destination (or all four), then asks
whether to commit and push the complete current Nova update to GitHub's `main`
branch. One comment is entered at the beginning and reused for every
selected Cloudflare deployment and the optional GitHub commit. It defaults to
`pushed by nova deploy cmd`. It verifies GitHub CLI authentication and can open
the browser login flow when needed. On the first push it can safely connect the
working folder to `https://github.com/Nexus-web-prod/NOVA.git` and commit the
complete reorganized project. The picker also has a GitHub-only option for
retrying a push without another Cloudflare deployment. On macOS,
`scripts/deploy/Deploy Nova.command` provides a double-click launcher.

Preview:

```sh
SKIP_VOICE_DEPLOY=1 ./scripts/deploy/deploy-pages-turso.sh
```

Production:

```sh
PAGES_ENV=production ./scripts/deploy/deploy-pages-turso.sh
```

The runtime allowlist in the script is authoritative. Documentation, tests,
reports, SQL, shell scripts, and Wrangler configuration must never enter the
temporary production bundle. Verify `/api/health` after deployment.
