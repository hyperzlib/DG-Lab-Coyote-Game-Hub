import Ajv, { ValidateFunction } from "ajv";

class TypeValidator {
    public ajv = new Ajv();

    public validators: Map<string, ValidateFunction> = new Map();

    constructor() { }

    public async initialize() {
        this.validators.set('CoyoteLiveGameConfig', this.ajv.compile(await import('../schemas/CoyoteLiveGameConfig.json')));
        this.validators.set('RandomStrengthConfig', this.ajv.compile(await import('../schemas/RandomStrengthConfig.json')));
        this.validators.set('MainConfigType', this.ajv.compile(await import('../schemas/MainConfigType.json')));
    }

    public validate(type: string, data: any): boolean {
        const validator = this.validators.get(type);
        if (!validator) {
            throw new Error(`Validator for type ${type} not found.`);
        }

        return validator(data);
    }

    public get validateCoyoteLiveGameConfig() {
        return this.validators.get('CoyoteLiveGameConfig')!;
    }
    
    public get validateRandomStrengthConfig() {
        return this.validators.get('RandomStrengthConfig')!;
    }

    public get validateMainConfigType() {
        return this.validators.get('MainConfigType')!;
    }
}

export const validator = new TypeValidator();