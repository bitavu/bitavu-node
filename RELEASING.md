# Releasing the Bitavu Node.js SDK

The package is published as `@bitavu/client` in the Bitavu npm organization.

## Prepare a release

Set the release version in `package.json` and update `package-lock.json`. Run `npm ci`, `npm test`, and `npm run check:package`. The last command checks the package contents, installs the tarball in a separate consumer project, and prints its SHA-256.

Review the exact tarball, source and Git history, GitHub metadata, CI logs, and artifacts. Resolve any privacy findings before the package owner approves the reviewed tarball. Repository visibility has its own approval.

## Publish the first version

After approval, a Bitavu npm organization maintainer with package publishing access can submit the reviewed tarball using `npm stage publish ./artifacts/bitavu-client-0.1.0.tgz --access public`. Substitute the approved file for the release. npm creates a public placeholder for a new package when it is staged. Approve the staged version with 2FA after checking the package name, version, and digest.

## Stage later versions from GitHub Actions

In the npm package settings, configure a GitHub Actions trusted publisher for repository `bitavu/bitavu-node`, workflow `publish.yml`, and environment `npm`. Grant staging permission. In GitHub Actions, dispatch **Stage npm release** from `main` with the approved tarball SHA-256. The job builds and checks the package, compares its digest, and stages it with OIDC. An npm maintainer reviews the staged version and approves it with 2FA.

See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) and [npm staged publishing](https://docs.npmjs.com/staged-publishing/) for registry setup.
