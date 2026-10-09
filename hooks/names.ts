// The two names the pure modules print, set from the config (hooks/config.ts) whenever it loads. Neutral until then.
//   owner    what a blocked-on line and an inbox note call the person ("you" unless the config's "owner" says otherwise)
//   dataDir  the data folder as shown in a message, relative to the project root
export const names = { owner: 'you', dataDir: '.cockpit' }

export const setNames = (n: { owner: string; dataDir: string }): void => {
  names.owner = n.owner
  names.dataDir = n.dataDir
}
