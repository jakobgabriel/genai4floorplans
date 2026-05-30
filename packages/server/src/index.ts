import { createApp } from "./app.ts";
import { ENV } from "./lib/env.ts";

const app = createApp();
app.listen(ENV.port, () => {
  // eslint-disable-next-line no-console
  console.log(`FlowPlan API listening on :${ENV.port}`);
});
