// Production entry: sets NODE_ENV before config is read (works the same on Windows, macOS and Linux).
process.env.NODE_ENV ??= 'production'
await import('./index')
export {}
