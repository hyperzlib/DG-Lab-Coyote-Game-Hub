import Ajv, { ValidateFunction } from "ajv";

class TypeValidator {
    public ajv = new Ajv();

    public validators: Map<string, ValidateFunction> = new Map();

    constructor() { }

    public async initialize() {
        this.validators.set('MainGameConfig', this.ajv.compile(await import('../schemas/MainGameConfig.json')));
        this.validators.set('GameStrengthConfig', this.ajv.compile(await import('../schemas/GameStrengthConfig.json')));
        this.validators.set('GameCustomPulseConfig', this.ajv.compile(await import('../schemas/GameCustomPulseConfig.json')));
        this.validators.set('MainConfigType', this.ajv.compile(await import('../schemas/MainConfigType.json')));
    }

    public validate(type: string, data: any): boolean {
        const validator = this.validators.get(type);
        if (!validator) {
            throw new Error(`Validator for type ${type} not found.`);
        }

        return validator(data);
    }

    public get validateMainGameConfig() {
        return this.validators.get('MainGameConfig')!;
    }
    
    public get validateGameStrengthConfig() {
        return this.validators.get('GameStrengthConfig')!;
    }

    public get validateGameCustomPulseConfig() {
        return this.validators.get('GameCustomPulseConfig')!;
    }

    public get validateMainConfigType() {
        return this.validators.get('MainConfigType')!;
    }
}

export const validator = new TypeValidator();