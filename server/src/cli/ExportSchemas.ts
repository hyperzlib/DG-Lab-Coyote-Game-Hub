import { MainConfigSchema } from "#app/types/config.js";
import { zodToJsonSchema } from "@bpinternal/zod-to-json-schema";
import fs from 'fs';

const schemaMap = {
    'MainConfigSchema': MainConfigSchema,
}

const outputDir = './schemas'; // 输出目录

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

for (let [name, schema] of Object.entries(schemaMap)) {
    // 导出为 JSON 文件
    const outputFile = `${outputDir}/${name}.json`;
    console.log(`Exporting schema ${name} to ${outputFile}`);
    fs.writeFileSync(outputFile, JSON.stringify(zodToJsonSchema(schema), null, 2));
}