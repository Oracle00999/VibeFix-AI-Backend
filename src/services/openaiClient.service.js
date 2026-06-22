const OpenAI = require("openai");
const { env } = require("../config/env");

let client = null;

function isAiAvailable() {
  return env.aiEnabled && Boolean(env.openaiApiKey);
}

function getOpenAiClient() {
  if (!isAiAvailable()) {
    return null;
  }

  if (!client) {
    client = new OpenAI({
      apiKey: env.openaiApiKey,
    });
  }

  return client;
}

module.exports = {
  getOpenAiClient,
  isAiAvailable,
};
