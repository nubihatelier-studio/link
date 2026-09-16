/**
 * Where the app lives for everyone else. Hard-coded rather than read from
 * `location`: the link is meant to be handed to someone who doesn't have the
 * app yet, and the address the weaver is looking at can be a preview build,
 * a phone on the local network, or `localhost` while it's being made.
 */
export const APP_URL = 'https://nubih-creator.pages.dev'

/** The address as it reads out loud, without the "https://" nobody dictates. */
export const APP_URL_SHORT = APP_URL.replace(/^https?:\/\//, '')
