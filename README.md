# ColorQuest Online — starter build

This is an early online multiplayer prototype. It uses Node.js, Express and Socket.IO.

## What it includes
- Create a private room with a six-character code
- Join from another browser/device
- Up to four players
- Host can add computer opponents, start, or close the room
- Server-managed turns and hands

## Run locally
1. Install Node.js 18 or newer.
2. Open a terminal in this folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000` in a browser.
6. To test two players, open a second browser window and join using the room code.

## Hosting
This app needs a Node.js host that supports WebSockets (for example, a suitable Render web service). Deploy this folder from a Git repository, use `npm install` as the build command and `npm start` as the start command. Keep the service running while players are using it.

## Important limitations before public release
This is a development prototype, not an app-store-ready game. It has not had security, load, accessibility, privacy, child-safety, or comprehensive rules testing. Rooms are held in server memory and disappear if the server restarts. Reconnection to an in-progress game is not implemented. There is no persistent account system, database, advertising, analytics, payment system, moderation, or app-store packaging.

The current card rules are a simple original matching-game implementation. Have the final rules and branding reviewed for intellectual-property and consumer-law considerations before public release. Do not use third-party game names, logos, card art, or sounds without permission.
