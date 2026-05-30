import { describe, it, expect } from "vitest";
import { SAMPLE } from "../../model/sample";
import { buildRating } from "../../engine/rating";
import { validateFlow } from "../../engine/validate";
import { chainRating } from "../../engine/automation";
import { createOpenAiProvider } from "./openai";
import type { FetchLike } from "./core";
import type { ProposalContext } from "../types";

function ctxFor(model = SAMPLE): ProposalContext {
  return {
    model,
    rating: buildRating(model),
    validation: validateFlow(model.stations, model.flows),
    chain: chainRating(model.stations, model.flows),
  };
}

describe("OpenAI adapter (mocked) — Chat Completions transport", () => {
  it("builds a Bearer/json_object request and re-scores AI output with the engine", async () => {
    const candidate = { ...SAMPLE, stations: SAMPLE.stations.map((s) => (s.id === "cnc" ? { ...s, x: 6, y: 6 } : s)) };
    let captured: { url: string; init: RequestInit } | null = null;
    const fakeFetch: FetchLike = (async (url: string, init: RequestInit) => {
      captured = { url, init };
      return {
        ok: true,
        async json() {
          // OpenAI shape: choices[0].message.content. Include a bogus composite to ignore.
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify([{ title: "AI move", rationale: "x", composite: 999, model: candidate }]),
                },
              },
            ],
          };
        },
        async text() {
          return "";
        },
      } as unknown as Response;
    }) as unknown as FetchLike;

    const provider = createOpenAiProvider({ apiKey: "k", model: "gpt-4o" }, fakeFetch);
    const proposals = await provider.propose(ctxFor());

    // Transport: correct endpoint, Bearer auth, JSON response_format.
    expect(captured!.url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = captured!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer k");
    const body = JSON.parse(captured!.init.body as string);
    expect(body.model).toBe("gpt-4o");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].role).toBe("system");

    // Output is engine-re-scored, never the model's own 999.
    expect(proposals.length).toBe(1);
    expect(proposals[0].after.composite).toBeCloseTo(buildRating(candidate).composite, 6);
    expect(proposals[0].after.composite).not.toBe(999);
    expect(proposals[0].source).toBe("llm");
  });

  it("falls back to the bracket extractor when the reply has stray prose", async () => {
    const fakeFetch: FetchLike = (async () =>
      ({
        ok: true,
        async json() {
          return { choices: [{ message: { content: "Here you go:\n" + JSON.stringify(SAMPLE) + "\nDone." } }] };
        },
        async text() {
          return "";
        },
      }) as unknown as Response) as unknown as FetchLike;
    const provider = createOpenAiProvider({ apiKey: "k", model: "gpt-4o" }, fakeFetch);
    const model = await provider.design("anything");
    expect(model.stations.length).toBe(SAMPLE.stations.length);
  });
});
