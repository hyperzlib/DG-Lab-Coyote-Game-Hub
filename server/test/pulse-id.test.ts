import test from 'node:test';
import assert from 'node:assert/strict';
import { DGLabPulseService, validateCustomPulseIds } from '../src/services/DGLabPulse.ts';

test('自定义波形 ID 不能与默认波形或其他自定义波形重复', () => {
    const defaultPulses = [{ id: 'default-pulse' }];

    assert.doesNotThrow(() => validateCustomPulseIds([{ id: 'custom-pulse' }], defaultPulses));
    assert.throws(() => validateCustomPulseIds([{ id: 'default-pulse' }], defaultPulses), /conflicts with a default pulse/);
    assert.throws(() => validateCustomPulseIds([{ id: 'custom-pulse' }, { id: 'custom-pulse' }], defaultPulses), /Duplicate custom pulse ID/);
});

test('默认波形优先于冲突的历史自定义波形', () => {
    const pulseService = new DGLabPulseService();
    pulseService.pulseList = [{
        id: 'same-id',
        name: '默认波形',
        pulseData: ['0A0A0A0A00000000'],
    }];

    const pulse = pulseService.getPulse('same-id', [{
        id: 'same-id',
        name: '历史自定义波形',
        pulseData: ['1414141400000000'],
    }]);

    assert.equal(pulse?.name, '默认波形');
});
