import * as fs from 'fs';
import { CustomSkinInfo, CustomSkinManifest, CustomSkinManifestSchema } from "#app/types/customSkin.js";
import { z } from 'koa-swagger-decorator';

export class CustomSkinService {
    private static _instance: CustomSkinService;

    private skinsPath = 'public/skins';
    private skinsBaseUrl = '/skins';

    public skins: CustomSkinInfo[] = [];
    
    public static createInstance() {
        if (!this._instance) {
            this._instance = new CustomSkinService();
        }
    }

    public static get instance() {
        this.createInstance();
        return this._instance;
    }

    public async initialize() {
        await this.scanSkins();
    }

    public async scanSkins() {
        if (!fs.existsSync(this.skinsPath)) {
            console.log('CustomSkins path not found, ignore.');
            return;
        }

        const files = await fs.promises.readdir(this.skinsPath);
        const skins: CustomSkinInfo[] = [];
        for (const skinDir of files) {
            if (!fs.statSync(`${this.skinsPath}/${skinDir}`).isDirectory()) {
                continue;
            }

            const manifestPath = `${this.skinsPath}/${skinDir}/skin.json`;
            if (!fs.existsSync(manifestPath)) {
                continue;
            }

            const manifestContent = await fs.promises.readFile(manifestPath, { encoding: 'utf-8' });
            let manifest: CustomSkinManifest = JSON.parse(manifestContent);

            try {
                manifest = CustomSkinManifestSchema.parse(manifest);
            } catch (error: any) {
                if (error instanceof z.ZodError) {
                    console.error(`Invalid manifest for skin ${skinDir}:`, error.errors);
                    continue;
                } else {
                    console.error(`Error parsing manifest for skin ${skinDir}:`, error);
                    continue;
                }
            }

            let skinIndexUrl = `${this.skinsBaseUrl}/${skinDir}/${manifest.main}`;
            skins.push({
                ...manifest,
                url: skinIndexUrl,
            });
        }

        this.skins = skins;
    }
}