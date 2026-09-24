# Transmission Web Control

Transmission Web Control is a lightweight web client for managing a Transmission daemon through its JSON-RPC API.

The interface lets you view and manage files, start and stop transfers, add download files or URLs, remove items, inspect daemon status, configure connection settings, and toggle alternative speed limits.

## Requirements

- Node.js 18 or newer
- A running Transmission daemon with its RPC endpoint enabled

## Development

Install the dependencies from the `twc` directory:

```sh
cd twc
npm install
```

Start the development build and local server:

```sh
npm run dev
```

The development server serves the generated client at <http://localhost:3000>. Source changes are watched and rebuilt automatically.

## Production Build

Build the minified client with:

```sh
cd twc
npm run build
```

The compiled files are written to `twc/web`:

- `twc/web/twc.html` - application shell
- `twc/web/twc.js` - bundled JavaScript
- `twc/web/twc.css` - compiled stylesheet

Serve the contents of `twc/web` with any static web server. The repository also contains a top-level `web` directory containing a built client.

## Connecting to Transmission

Open **Settings** in the client and enter the Transmission RPC address, username, and password. The default RPC address is `../rpc`, which is useful when the client is hosted alongside a reverse proxy that exposes Transmission's RPC endpoint at that relative path.

The browser must be able to reach the RPC endpoint from the page origin. If the client and Transmission are hosted on different origins, configure the server or reverse proxy to allow the required cross-origin requests.

## Project Structure

```text
twc/
  src/          Source JavaScript and Sass
  web/          Build output for local development and deployment
  esbuild.js    Build and watch configuration
  http-server.js Local development server
web/            Checked-in top-level build output
```

The source entry points are `twc/src/js/twc.js` and `twc/src/css/twc.scss`. The build bundles JavaScript with esbuild and compiles Sass through the esbuild Sass plugin.
