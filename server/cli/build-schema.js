const { spawn } = require('child_process');
const { createHash } = require('crypto');
const fs = require('fs');
const tsj = require('ts-json-schema-generator');

async function md5File(file) {
    const fileContent = await fs.promises.readFile(file);
    return createHash('md5').update(fileContent).digest('hex');
}

const typesList = [
    {
        file: './src/types/game.ts',
        types: ['GameStrengthConfig', 'GameCustomPulseConfig', 'MainGameConfig']
    },
    {
        file: './src/types/config.ts',
        types: ['MainConfigType']
    }
];

const outputDir = './src/schemas';
const schemaMetaFile = `${outputDir}/schemas.json`;

async function buildSchemas() {
    // 读取meta文件
    let schemaMeta = {};
    if (fs.existsSync(schemaMetaFile)) {
        schemaMeta = JSON.parse(await fs.promises.readFile(schemaMetaFile));
    }

    for (let {file, types} of typesList) {
        for (let typeName of types) {
            // 如果文件已存在，则检测缓存
            const schemaFile = `${outputDir}/${typeName}.json`;
            if (fs.existsSync(schemaFile) && schemaMeta[schemaFile]) {
                const schemaMetaData = schemaMeta[schemaFile];
                const fileMd5 = await md5File(file);

                if (schemaMetaData.fileMd5 === fileMd5) {
                    console.log(`Schema for ${typeName} is up to date`);
                    continue;
                }
            }

            // 生成schema
            let schemaConfig = {
                path: file,
                type: typeName,
            };
            let schema = tsj.createGenerator(schemaConfig).createSchema(schemaConfig.type);
            let schemaJson = JSON.stringify(schema, null, 4);
            await fs.promises.writeFile(schemaFile, schemaJson);

            console.log(`Generated schema for ${typeName}`);

            // 更新meta
            const fileMd5 = await md5File(file);
            schemaMeta[schemaFile] = { fileMd5 };
        };

        await fs.promises.writeFile(schemaMetaFile, JSON.stringify(schemaMeta, null, 4));
    }
}

buildSchemas();