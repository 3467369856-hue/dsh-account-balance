/**
 * dsh-account-balance — host half.
 *
 * This plugin adds no Host service: the sidebar panel it renders reads the
 * account figures through the account Remote the shipped
 * `@deepseek-ai/dsh-client-ui-settings-account` plugin already exposes
 * (`ctx.remote.account`), which the Host backs with
 * `@deepseek-ai/dsh-api-account-controller` and the DeepSeek account platform
 * provider.
 *
 * The Host entry exists because a browser client plugin is discovered from an
 * enabled Loader entry: `@deepseek-ai/dsh-client-modules` scans the Loader for
 * packages declaring `dsh.client`, so this package must be mounted for
 * `lib/client.js` to reach the page.
 *
 * @module dsh-account-balance
 */

/** Loader entry name (also the browser module id the client bundle registers). */
export const name = 'dsh-account-balance'

/** No Host-level service dependency. */
export const inject = []

/** Mount the entry; all behavior lives in the client half. */
export function apply() {}
