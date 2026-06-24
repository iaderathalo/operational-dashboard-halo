#!/usr/bin/env node
/**
 * Dremio REST API probe — Part A of the PlanView live-source spike.
 *
 * Usage:
 *   DREMIO_PAT=<token> node scripts/dremio-probe.js
 *
 * Environment:
 *   DREMIO_PAT          — Personal Access Token (required)
 *   DREMIO_BASE_URL     — defaults to https://dremiodev.mrshmc.com
 *   DREMIO_VIEW_PATH    — defaults to CAI.Applications (space.schema.view)
 *
 * Outputs findings to stdout and writes a sample to scripts/dremio-probe-output.json.
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

// ─── Config ────────────────────────────────────────────────────────────────────
const DREMIO_PAT = process.env.DREMIO_PAT_PROD || process.env.DREMIO_PAT;
if (!DREMIO_PAT) {
    console.error('ERROR: DREMIO_PAT_PROD or DREMIO_PAT environment variable is required.');
    process.exit(1);
}

const DREMIO_BASE_URL = (process.env.DREMIO_BASE_URL || 'https://dremioprod.mrshmc.com').replace(
    /\/$/,
    ''
);
const DREMIO_VIEW_PATH = process.env.DREMIO_VIEW_PATH || 'CAI.ConsolidatedApplicationInventory.dbo.vwAllApplications_Latest';

// For corporate TLS (ZScaler), allow self-signed certs if NODE_TLS_REJECT_UNAUTHORIZED=0
const AGENT = new https.Agent({ rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' });

// ─── HTTP helpers ──────────────────────────────────────────────────────────────
async function dremioGet(urlPath) {
    const url = `${DREMIO_BASE_URL}${urlPath}`;
    const resp = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${DREMIO_PAT}`,
            'Content-Type': 'application/json',
        },
        agent: AGENT,
    });
    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`GET ${urlPath} → ${resp.status}: ${body.slice(0, 500)}`);
    }
    return resp.json();
}

async function dremioPost(urlPath, body) {
    const url = `${DREMIO_BASE_URL}${urlPath}`;
    const resp = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${DREMIO_PAT}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        agent: AGENT,
    });
    if (!resp.ok) {
        const respBody = await resp.text().catch(() => '');
        throw new Error(`POST ${urlPath} → ${resp.status}: ${respBody.slice(0, 500)}`);
    }
    return resp.json();
}

// ─── Dremio job polling ────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 1000;
const MAX_POLL_ATTEMPTS = 120; // 2 minutes max

async function waitForJob(jobId) {
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        const status = await dremioGet(`/api/v3/job/${jobId}`);
        const state = status.jobState || status.state;

        if (state === 'COMPLETED') return status;
        if (state === 'FAILED' || state === 'CANCELED' || state === 'CANCELLED') {
            throw new Error(`Job ${jobId} ended with state: ${state} — ${JSON.stringify(status.errorMessage || '')}`);
        }

        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(`Job ${jobId} did not complete within ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS / 1000}s`);
}

async function fetchAllResults(jobId, pageSize = 500) {
    const rows = [];
    let offset = 0;
    for (;;) {
        const page = await dremioGet(`/api/v3/job/${jobId}/results?offset=${offset}&limit=${pageSize}`);
        const pageRows = page.rows || [];
        rows.push(...pageRows);
        if (pageRows.length < pageSize) break;
        offset += pageSize;
    }
    return rows;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Dremio REST API Probe — PlanView Live Source Spike');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Base URL:   ${DREMIO_BASE_URL}`);
    console.log(`View path:  ${DREMIO_VIEW_PATH}`);
    console.log('');

    // ─── Step 1: Resolve the view via catalog-by-path ──────────────────────────
    console.log('─── Step 1: Resolve view via /api/v3/catalog/by-path ───');
    const pathSegments = DREMIO_VIEW_PATH.split('.');
    const catalogPath = pathSegments.map(encodeURIComponent).join('/');

    let viewMeta;
    try {
        viewMeta = await dremioGet(`/api/v3/catalog/by-path/${catalogPath}`);
        console.log(`  ✓ View found: ${viewMeta.path?.join('.') || DREMIO_VIEW_PATH}`);
        console.log(`  Type: ${viewMeta.type}`);
        if (viewMeta.sql) console.log(`  SQL: ${viewMeta.sql}`);
        if (viewMeta.fields) {
            console.log(`  Fields (${viewMeta.fields.length}): ${viewMeta.fields.map(f => f.name).join(', ')}`);
        }
    } catch (err) {
        console.error(`  ✗ Failed to resolve view: ${err.message}`);
        console.log('  Trying alternative path formats...');

        // Try with quotes
        const altPaths = [
            `"CAI"."Applications"`,
            `CAI."Applications"`,
            `"CAI".Applications`,
        ];
        for (const alt of altPaths) {
            try {
                const segments = alt.replace(/"/g, '').split('.');
                const altCatalog = segments.map(encodeURIComponent).join('/');
                viewMeta = await dremioGet(`/api/v3/catalog/by-path/${altCatalog}`);
                console.log(`  ✓ Found with alt path: ${alt}`);
                break;
            } catch { /* try next */ }
        }
        if (!viewMeta) {
            console.error('  ✗ Could not resolve the view. Check DREMIO_VIEW_PATH.');
            process.exit(1);
        }
    }
    console.log('');

    // ─── Step 2: Run COUNT(*) query ────────────────────────────────────────────
    const viewRef = pathSegments.map(s => `"${s}"`).join('.');
    console.log(`─── Step 2: COUNT(*) from ${viewRef} ───`);

    const countSql = `SELECT COUNT(*) AS total FROM ${viewRef}`;
    const countJob = await dremioPost('/api/v3/sql', { sql: countSql });
    console.log(`  Job ID: ${countJob.id}`);
    await waitForJob(countJob.id);
    const countResult = await fetchAllResults(countJob.id);
    const totalRows = countResult[0]?.total || countResult[0]?.EXPR$0 || 'unknown';
    console.log(`  ✓ Total rows in view: ${totalRows}`);
    console.log('');

    // ─── Step 3: Fetch LIMIT 50 sample ─────────────────────────────────────────
    console.log(`─── Step 3: LIMIT 50 sample ───`);
    const sampleSql = `SELECT * FROM ${viewRef} LIMIT 50`;
    const sampleJob = await dremioPost('/api/v3/sql', { sql: sampleSql });
    console.log(`  Job ID: ${sampleJob.id}`);
    await waitForJob(sampleJob.id);
    const sampleRows = await fetchAllResults(sampleJob.id);
    console.log(`  ✓ Sample rows returned: ${sampleRows.length}`);
    if (sampleRows.length > 0) {
        const fields = Object.keys(sampleRows[0]);
        console.log(`  Fields (${fields.length}): ${fields.join(', ')}`);
    }
    console.log('');

    // ─── Step 4: Fetch ALL rows (paginated) ────────────────────────────────────
    console.log(`─── Step 4: Full SELECT * (paginated results) ───`);
    const fullSql = `SELECT * FROM ${viewRef}`;
    const fullJob = await dremioPost('/api/v3/sql', { sql: fullSql });
    console.log(`  Job ID: ${fullJob.id}`);
    await waitForJob(fullJob.id);
    const allRows = await fetchAllResults(fullJob.id);
    console.log(`  ✓ Total rows fetched: ${allRows.length}`);
    console.log('');

    // ─── Step 5: Diff against static file ──────────────────────────────────────
    console.log('─── Step 5: Diff against static file ───');
    const staticPath = path.join(__dirname, '..', 'db', 'PlanviewData_Dremio_CAI_Applications.json');
    const rawStatic = fs.readFileSync(staticPath, 'utf8');
    const staticData = JSON.parse(rawStatic.replace(/}\s*{/g, '},{'));

    console.log(`  Static file records: ${staticData.length}`);
    console.log(`  Dremio API records:  ${allRows.length}`);
    console.log(`  Delta: ${allRows.length - staticData.length}`);
    console.log('');

    // Check key fields
    const REQUIRED_FIELDS = [
        'CASTKey', 'InternalID', 'ProductName', 'ProductCode', 'Status',
        'OpCo', 'BusinessDeliveryPortfolioName', 'ItOwner', 'ItOwnerEmail',
        'PortfolioOwnerName', 'PortfolioOwnerEmail', 'InternalUserCount', 'ExternalUserCount',
        'DataDate',
    ];

    const apiFields = allRows.length > 0 ? Object.keys(allRows[0]) : [];
    const missingFields = REQUIRED_FIELDS.filter(f => !apiFields.includes(f));
    const presentFields = REQUIRED_FIELDS.filter(f => apiFields.includes(f));

    console.log(`  Required fields present (${presentFields.length}/${REQUIRED_FIELDS.length}):`);
    presentFields.forEach(f => console.log(`    ✓ ${f}`));
    if (missingFields.length > 0) {
        console.log(`  MISSING required fields (${missingFields.length}):`);
        missingFields.forEach(f => console.log(`    ✗ ${f}`));
    }
    console.log('');

    // Check DataDate semantics
    if (allRows.length > 0 && allRows[0].DataDate) {
        const dataDates = [...new Set(allRows.map(r => r.DataDate))].sort();
        console.log(`  DataDate values: ${dataDates.length} distinct`);
        console.log(`    Earliest: ${dataDates[0]}`);
        console.log(`    Latest:   ${dataDates[dataDates.length - 1]}`);
        const isLive = dataDates.length === 1 && dataDates[0]?.includes('2026-06');
        console.log(`    Semantics: ${isLive ? 'Single snapshot date (view is refreshed periodically)' : 'Multiple dates / historical'}`);
    }
    console.log('');

    // Active-status + key-field filter comparison
    const apiActive = allRows
        .filter(r => r.Status === 'In Production' || r.Status === 'In Development')
        .filter(r => r.ProductName && (r.CASTKey || r.ProductCode) && r.InternalID);
    const staticActive = staticData
        .filter(r => r.Status === 'In Production' || r.Status === 'In Development')
        .filter(r => r.ProductName && (r.CASTKey || r.ProductCode) && r.InternalID);

    console.log(`  After active filter + key fields:`);
    console.log(`    Static: ${staticActive.length}`);
    console.log(`    API:    ${apiActive.length}`);
    console.log(`    Delta:  ${apiActive.length - staticActive.length}`);
    console.log('');

    // InternalID overlap
    const staticIds = new Set(staticData.map(r => r.InternalID));
    const apiIds = new Set(allRows.map(r => r.InternalID));
    const overlap = [...apiIds].filter(id => staticIds.has(id)).length;
    const onlyInApi = [...apiIds].filter(id => !staticIds.has(id)).length;
    const onlyInStatic = [...staticIds].filter(id => !apiIds.has(id)).length;

    console.log(`  InternalID overlap:`);
    console.log(`    Both:           ${overlap}`);
    console.log(`    Only in API:    ${onlyInApi}`);
    console.log(`    Only in static: ${onlyInStatic}`);
    console.log('');

    // CASTKey population
    const apiWithCast = allRows.filter(r => r.CASTKey && r.CASTKey.trim()).length;
    const staticWithCast = staticData.filter(r => r.CASTKey && r.CASTKey.trim()).length;
    console.log(`  CASTKey populated:`);
    console.log(`    Static: ${staticWithCast}/${staticData.length} (${(staticWithCast/staticData.length*100).toFixed(1)}%)`);
    console.log(`    API:    ${apiWithCast}/${allRows.length} (${(apiWithCast/allRows.length*100).toFixed(1)}%)`);
    console.log('');

    // ─── Step 6: Summary ───────────────────────────────────────────────────────
    const parity = missingFields.length === 0 && overlap >= staticData.length * 0.9;
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  VERDICT: ${parity ? 'GO ✓' : 'NO-GO ✗'}`);
    console.log(`  Key fields present: ${missingFields.length === 0 ? 'YES' : 'NO'}`);
    console.log(`  Row parity (>90% overlap): ${overlap >= staticData.length * 0.9 ? 'YES' : 'NO'}`);
    console.log('═══════════════════════════════════════════════════════════════');

    // Write output for reference
    const output = {
        timestamp: new Date().toISOString(),
        config: { baseUrl: DREMIO_BASE_URL, viewPath: DREMIO_VIEW_PATH },
        viewMeta: viewMeta ? { type: viewMeta.type, sql: viewMeta.sql, fieldCount: viewMeta.fields?.length } : null,
        counts: { totalApiRows: allRows.length, totalStaticRows: staticData.length, apiActive: apiActive.length, staticActive: staticActive.length },
        fields: { api: apiFields, required: REQUIRED_FIELDS, missing: missingFields },
        idOverlap: { both: overlap, onlyApi: onlyInApi, onlyStatic: onlyInStatic },
        dataDates: allRows.length > 0 ? [...new Set(allRows.map(r => r.DataDate))].sort() : [],
        sampleRows: sampleRows.slice(0, 3),
        verdict: parity ? 'GO' : 'NO-GO',
    };
    const outputPath = path.join(__dirname, 'dremio-probe-output.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nOutput written to: ${outputPath}`);
}

main().catch((err) => {
    console.error('FATAL:', err.message);
    process.exit(1);
});
