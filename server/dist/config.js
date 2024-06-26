import yaml from 'js-yaml';
import * as fs from 'fs';
export class Config {
    value = null;
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    async load() {
        try {
            const fileContent = await fs.promises.readFile(this.filePath, { encoding: 'utf-8' });
            this.value = yaml.load(fileContent);
        }
        catch (error) {
            console.error('Failed to read config:', error);
        }
    }
    async save() {
        if (this.value) {
            try {
                const yamlStr = yaml.dump(this.value);
                await fs.promises.writeFile(this.filePath, yamlStr, { encoding: 'utf-8' });
            }
            catch (error) {
                console.error('Failed to save config:', error);
            }
        }
    }
}
export class MainConfig {
    static instance;
    static async initialize() {
        MainConfig.instance = new Config('config.yaml');
        await MainConfig.instance.load();
    }
    static get value() {
        return MainConfig.instance.value;
    }
    static load() {
        return MainConfig.instance.load();
    }
    static save() {
        return MainConfig.instance.save();
    }
}
