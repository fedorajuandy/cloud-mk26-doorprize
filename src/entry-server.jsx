import { createHandler, StartServer } from "@solidjs/start/server";
export default createHandler(() => (
  <StartServer
    document={(props) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Mandiri Carnaval 2026 · Doorprize</title>
          {props.assets}
        </head>
        <body>
          <div id="app">{props.children}</div>
          {props.scripts}
        </body>
      </html>
    )}
  />
));
