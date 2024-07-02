import yaml from 'js-yaml';
import * as fs from 'fs';
import { MainConfigType } from './types/config';
import { validator } from './utils/validator';

export class Config<ConfigType = any> {
    public value: ConfigType | null = null;
    public filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    public async load() {
        try {
            const fileContent = await fs.promises.readFile(this.filePath, { encoding: 'utf-8' });
            this.value = yaml.load(fileContent) as ConfigType;
        } catch (error: any) {
            console.error('Failed to read config:', error);
        }
    }

    public async save() {
        if (this.value) {
            try {
                const yamlStr = yaml.dump(this.value);
                await fs.promises.writeFile(this.filePath, yamlStr, { encoding: 'utf-8' });
            } catch (error: any) {
                console.error('Failed to save config:', error);
            }
        }
    }
}

export class MainConfig {
    public static instance: Config<MainConfigType>;

    public static async initialize() {
        if (!fs.existsSync('config.yaml') && fs.existsSync('config.example.yaml')) {
            // 如果配置文件不存在，但存在示例配置文件，则复制示例配置文件
            fs.copyFileSync('config.example.yaml', 'config.yaml');
        }

        MainConfig.instance = new Config<MainConfigType>('config.yaml');
        await MainConfig.instance.load();

        if (!validator.validateMainConfigType(MainConfig.value)) {
            console.error('MainConfig validation failed.');
            console.error(validator.validateMainConfigType.errors);
            throw new Error(`MainConfig validation failed.`);
        }
    }

    public static get value() {
        return MainConfig.instance.value!;
    }

    public static load(): Promise<void> {
        return MainConfig.instance.load();
    }

    public static save(): Promise<void> {
        return MainConfig.instance.save();
    }
}