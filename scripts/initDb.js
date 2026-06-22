const fs = require("fs/promises");
const path = require("path");
const { query, closePool } = require("../src/config/database");

async function initDb() {
  const schemaPath = path.join(__dirname, "..", "src", "db", "schema.sql");
  const schemaSql = await fs.readFile(schemaPath, "utf8");

  await query(schemaSql);
  console.log("Database schema is ready.");
}

initDb()
  .catch((error) => {
    console.error(formatDatabaseError(error));
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });

function formatDatabaseError(error) {
  if (error.message.includes("client password must be a string")) {
    return [
      "PostgreSQL requires a password for this connection.",
      "Create Backend/.env from Backend/.env.example and set DATABASE_URL with your username and password.",
      "Example: DATABASE_URL=postgres://username:password@localhost:5432/ai_website_design_polisher",
    ].join("\n");
  }

  if (error.code === "28P01") {
    return [
      "PostgreSQL rejected the configured username or password.",
      "Update DATABASE_URL in Backend/.env with credentials that can create/use the ai_website_design_polisher database.",
    ].join("\n");
  }

  if (error.code === "ECONNREFUSED") {
    return "PostgreSQL is not running or is not accepting connections on the configured DATABASE_URL.";
  }

  if (error.code === "3D000") {
    return "Database does not exist yet. Create it first with: createdb ai_website_design_polisher";
  }

  return error.message;
}
