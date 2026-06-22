const { query } = require("../config/database");

async function createAudit(input) {
  const result = await query(
    `INSERT INTO audits (
      url,
      status,
      desktop_screenshot,
      mobile_screenshot,
      score,
      issues,
      summary,
      suggestions,
      before_after,
      rules,
      improved_preview,
      generated_code
    )
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb)
    RETURNING *`,
    [
      input.url,
      input.status || "pending",
      input.desktopScreenshot || null,
      input.mobileScreenshot || null,
      input.score || null,
      JSON.stringify(input.issues || []),
      input.summary || "",
      JSON.stringify(input.suggestions || []),
      input.beforeAfter ? JSON.stringify(input.beforeAfter) : null,
      JSON.stringify(input.rules || []),
      input.improvedPreview ? JSON.stringify(input.improvedPreview) : null,
      input.generatedCode ? JSON.stringify(input.generatedCode) : null,
    ],
  );

  return mapAuditRow(result.rows[0]);
}

async function updateAudit(id, updates) {
  const fields = [];
  const values = [];

  addField(fields, values, "status", updates.status);
  addField(fields, values, "desktop_screenshot", updates.desktopScreenshot);
  addField(fields, values, "mobile_screenshot", updates.mobileScreenshot);
  addField(fields, values, "score", updates.score);
  addJsonField(fields, values, "issues", updates.issues);
  addField(fields, values, "summary", updates.summary);
  addJsonField(fields, values, "suggestions", updates.suggestions);
  addJsonField(fields, values, "before_after", updates.beforeAfter);
  addJsonField(fields, values, "rules", updates.rules);
  addJsonField(fields, values, "improved_preview", updates.improvedPreview);
  addJsonField(fields, values, "generated_code", updates.generatedCode);

  if (fields.length === 0) {
    return findAuditById(id);
  }

  values.push(id);

  const result = await query(
    `UPDATE audits
      SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $${values.length}
      RETURNING *`,
    values,
  );

  return result.rows[0] ? mapAuditRow(result.rows[0]) : null;
}

async function findAuditById(id) {
  const result = await query("SELECT * FROM audits WHERE id = $1", [id]);
  return result.rows[0] ? mapAuditRow(result.rows[0]) : null;
}

async function listAudits() {
  const result = await query("SELECT * FROM audits ORDER BY created_at DESC", []);
  return result.rows.map(mapAuditRow);
}

async function deleteAudit(id) {
  const result = await query("DELETE FROM audits WHERE id = $1 RETURNING *", [id]);
  return result.rows[0] ? mapAuditRow(result.rows[0]) : null;
}

function addField(fields, values, columnName, value) {
  if (value === undefined) {
    return;
  }

  values.push(value);
  fields.push(`${columnName} = $${values.length}`);
}

function addJsonField(fields, values, columnName, value) {
  if (value === undefined) {
    return;
  }

  values.push(value === null ? null : JSON.stringify(value));
  fields.push(`${columnName} = $${values.length}::jsonb`);
}

function mapAuditRow(row) {
  return {
    id: row.id,
    url: row.url,
    status: row.status,
    desktopScreenshot: row.desktop_screenshot,
    mobileScreenshot: row.mobile_screenshot,
    score: row.score,
    issues: row.issues || [],
    summary: row.summary || "",
    suggestions: row.suggestions || [],
    beforeAfter: row.before_after,
    rules: row.rules || [],
    improvedPreview: row.improved_preview,
    generatedCode: row.generated_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  createAudit,
  updateAudit,
  findAuditById,
  listAudits,
  deleteAudit,
};
