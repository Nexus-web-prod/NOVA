#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy-pages-turso.sh"
PROJECT_NAME="${PROJECT_NAME:-nova-7}"
GITHUB_REPO_URL="https://github.com/Nexus-web-prod/NOVA.git"

cd "${PROJECT_ROOT}"

if [ ! -x "${DEPLOY_SCRIPT}" ]; then
  echo "The Nova Pages deployment script is missing or is not executable:" >&2
  echo "  ${DEPLOY_SCRIPT}" >&2
  exit 1
fi

echo "Nova 7 deployment"
echo "================="
echo
default_comment="pushed by nova deploy cmd"
printf "Comment for all deployments and GitHub [%s]: " "${default_comment}"
IFS= read -r release_comment
release_comment="${release_comment:-${default_comment}}"
export DEPLOY_COMMENT="${release_comment}"
echo
echo "Where would you like to deploy?"
echo "  1) Production  — https://${PROJECT_NAME}.pages.dev"
echo "  2) Dev         — https://dev.${PROJECT_NAME}.pages.dev"
echo "  3) Beta        — https://beta.${PROJECT_NAME}.pages.dev"
echo "  4) Main        — https://main.${PROJECT_NAME}.pages.dev"
echo "  5) All four"
echo "  6) GitHub only — skip Cloudflare"
echo
printf "Choose 1–6: "
IFS= read -r deploy_choice

export SKIP_VOICE_DEPLOY=1
cloudflare_deployed=1

deploy_production() {
  echo "Deploying production with comment: ${release_comment}"
  PROJECT_NAME="${PROJECT_NAME}" PAGES_ENV=production "${DEPLOY_SCRIPT}"
}

deploy_preview() {
  branch="$1"
  echo "Deploying ${branch} with comment: ${release_comment}"
  PROJECT_NAME="${PROJECT_NAME}" PAGES_ENV=preview BRANCH="${branch}" "${DEPLOY_SCRIPT}"
}

case "${deploy_choice}" in
  1) deploy_production ;;
  2) deploy_preview dev ;;
  3) deploy_preview beta ;;
  4) deploy_preview main ;;
  5)
    deploy_production
    echo
    deploy_preview dev
    echo
    deploy_preview beta
    echo
    deploy_preview main
    ;;
  6) cloudflare_deployed=0 ;;
  *)
    echo "Nothing was deployed: choose a number from 1 through 6." >&2
    exit 1
    ;;
esac

if [ "${cloudflare_deployed}" = "1" ]; then
  echo
  echo "Cloudflare deployment finished."
  echo
else
  echo
  echo "Cloudflare deployment skipped."
  echo
fi

printf "Would you also like to commit and push this version to GitHub? [y/N] "
IFS= read -r github_answer

case "${github_answer}" in
  y|Y|yes|YES|Yes)
    if ! command -v gh >/dev/null 2>&1; then
      echo
      echo "GitHub push skipped: GitHub CLI is not installed."
      echo "Install it from https://cli.github.com and run this command again."
      exit 0
    fi

    if ! gh auth status --hostname github.com >/dev/null 2>&1; then
      echo
      printf "GitHub is not logged in. Open the browser login now? [Y/n] "
      IFS= read -r login_answer
      case "${login_answer}" in
        n|N|no|NO|No)
          echo "GitHub login and push skipped."
          exit 0
          ;;
        *)
          gh auth login --hostname github.com --git-protocol https --web
          if ! gh auth status --hostname github.com >/dev/null 2>&1; then
            echo "GitHub login did not complete successfully." >&2
            exit 1
          fi
          ;;
      esac
    fi

    commit_comment="${release_comment}"

    first_connection=0
    if [ ! -d "${PROJECT_ROOT}/.git" ]; then
      echo
      printf "Connect this NOVA folder to Nexus-web-prod/NOVA? [Y/n] "
      IFS= read -r connect_answer
      case "${connect_answer}" in
        n|N|no|NO|No)
          echo "GitHub connection and push skipped."
          exit 0
          ;;
      esac

      git init -b main
      git remote add origin "${GITHUB_REPO_URL}"
      git fetch origin main
      # Attach the existing remote history without replacing any local files.
      git reset --mixed --quiet origin/main
      first_connection=1
    fi

    if ! git remote get-url origin >/dev/null 2>&1; then
      git remote add origin "${GITHUB_REPO_URL}"
    elif [ "$(git remote get-url origin)" != "${GITHUB_REPO_URL}" ]; then
      echo "GitHub push skipped: origin points to a different repository:" >&2
      git remote get-url origin >&2
      exit 1
    fi

    current_branch="$(git branch --show-current)"
    if [ "${current_branch}" != "main" ]; then
      echo "GitHub push skipped: switch to the main branch first (currently: ${current_branch:-detached})." >&2
      exit 1
    fi

    # If connection setup was interrupted after Git initialization, finish the
    # complete first import instead of committing only the README files.
    if ! git ls-files --error-unmatch website/html/index.html >/dev/null 2>&1; then
      first_connection=1
    fi

    if [ "${first_connection}" = "1" ]; then
      echo "First connection: including the complete reorganized NOVA project."
    fi

    # Include the complete current Nova update so the tree is clean before
    # rebasing and the shared release comment describes the whole release.
    git add -A

    if ! git diff --cached --quiet; then
      git commit -m "${commit_comment}"
    else
      echo "Nova has no new changes to commit."
    fi

    git pull --rebase origin main
    git push origin main
    echo "GitHub push finished."
    ;;
  *)
    echo "GitHub push skipped."
    ;;
esac
