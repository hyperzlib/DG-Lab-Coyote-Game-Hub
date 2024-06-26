const { spawn } = require('child_process');

const typesList = [
    {
        file: './src/types/game.ts',
        types: ['RandomStrengthConfig', 'CoyoteLiveGameConfig']
    },
    {
        file: './src/types/config.ts',
        types: ['MainConfigType']
    }
];

const outputDir = './src/schemas';

async function buildSchemas() {
    for (let {file, types} of typesList) {
        for (let typeName of types) {
            await new Promise((resolve, reject) => {
                const child = spawn('npx', [
                    'ts-json-schema-generator',
                    '-o',
                    `${outputDir}/${typeName}.json`,
                    '--path',
                    file,
                    '--type',
                    typeName
                ]);

                child.stdout.on('data', data => {
                    console.log(`stdout: ${data}`);
                });

                child.stderr.on('data', data => {
                    console.error(`stderr: ${data}`);
                });

                child.on('close', code => {
                    if (code !== 0) {
                        console.error(`child process exited with code ${code}`);
                        reject();
                    }

                    resolve();
                });
            });

            console.log(`Generated schema for ${typeName}`);
        };
    }
}

buildSchemas();