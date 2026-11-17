export function configuredValue(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text && !/change[-_ ]?me|your[-_ ]|votre[-_ ]|example\.(com|invalid)|adresse@|<[^>]+>|\.\.\./i.test(text) ? text : '';
}

export function serviceError(code, message, status = 503, cause) {
    return Object.assign(new Error(message, cause ? { cause } : undefined), { code, status });
}

export function integerSetting(value, fallback, min, max, name) {
    const number = value === undefined || value === '' ? fallback : Number(value);
    if (!Number.isInteger(number) || number < min || number > max) {
        throw serviceError('SERVICE_CONFIGURATION_INVALID', `${name} doit être un entier entre ${min} et ${max}.`);
    }
    return number;
}
