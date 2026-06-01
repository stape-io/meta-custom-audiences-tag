const encodeUriComponent = require('encodeUriComponent');
const getAllEventData = require('getAllEventData');
const getRequestHeader = require('getRequestHeader');
const getType = require('getType');
const JSON = require('JSON');
const logToConsole = require('logToConsole');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const Promise = require('Promise');
const Object = require('Object');
const sendHttpRequest = require('sendHttpRequest');
const sha256Sync = require('sha256Sync');

/*==============================================================================
==============================================================================*/

const eventData = getAllEventData();
const useOptimisticScenario = isUIFieldTrue(data.useOptimisticScenario);
const API_VERSION = '25.0';

if (shouldExitEarly(data, eventData)) {
  return data.gtmOnSuccess();
}

const mappedData = getDataForAudienceDataUpload(data);
const destinations = getDestinations(data);

const invalidFields = validateMappedData(data, destinations, mappedData);
if (invalidFields) {
  log({
    Name: 'MetaCustomAudiences',
    Type: 'Message',
    EventName: data.audienceAction,
    Message: '🛑 [ERROR] Request was not sent.',
    Reason: invalidFields
  });

  return data.gtmOnFailure();
}

sendRequests(data, destinations, mappedData);

if (useOptimisticScenario) {
  return data.gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function addAudienceMembersData(data, mappedData) {
  let audienceMembers = [];
  let schema = [];

  if (data.userMode === 'single') {
    const audienceMember = [];

    data.singleUserIdentifiersList.forEach((identifier) => {
      const identifierValues = itemizeInput(identifier.value);
      identifierValues.forEach((identifierValue) => {
        schema.push(identifier.name);
        audienceMember.push(identifierValue);
      });
    });

    if (isUIFieldTrue(data.enableDataProcessingOptions)) {
      schema.push('DATA_PROCESSING_OPTIONS');
      audienceMember.push(['LDU']);

      if (data.singleUserDataProcessingOptionsList) {
        data.singleUserDataProcessingOptionsList.forEach((udpOption) => {
          let udpOptionValue = udpOption.value;
          if (!isValidValue(udpOptionValue)) return;
          udpOptionValue = makeInteger(udpOptionValue);
          schema.push(udpOption.name);
          audienceMember.push(udpOptionValue);
        });
      }
    }

    audienceMembers.push(audienceMember);
  } else if (data.userMode === 'multiple') {
    if (getType(data.multipleUsersAudienceMembers) === 'array') {
      audienceMembers = data.multipleUsersAudienceMembers;
    }

    const parsedSchema = parseSchemaInput(data.multipleUsersSchema);
    if (parsedSchema && parsedSchema.length > 0) {
      schema = parsedSchema;
    }
  }

  mappedData.payload.schema = schema;
  mappedData.payload.data = audienceMembers;

  return mappedData;
}

function hashDataIfNeeded(mappedData) {
  const audienceMembers = mappedData.payload.data;
  const schema = mappedData.payload.schema;
  const schemaType = getType(schema);
  const noHashIdentifiers = {
    DATA_PROCESSING_OPTIONS: true,
    DATA_PROCESSING_OPTIONS_COUNTRY: true,
    DATA_PROCESSING_OPTIONS_STATE: true,
    MADID: true,
    LOOKALIKE_VALUE: true
  };
  const processIdentifier = (schema, identifier, index, identifiersArray) => {
    if (noHashIdentifiers[schema]) return;
    const normalizedIdentifier = normalizeBasedOnSchemaKey(schema, identifier);
    identifiersArray[index] = hashData(normalizedIdentifier);
  };

  if (audienceMembers && schema) {
    audienceMembers.forEach((audienceMember, i) => {
      if (!audienceMember) return;

      const audienceMemberType = getType(audienceMember);

      if (audienceMemberType === 'string') {
        processIdentifier(schema, audienceMember, i, audienceMembers);
      } else if (audienceMemberType === 'array') {
        audienceMember.forEach((identifier, j) => {
          if (!identifier) return;
          processIdentifier(
            schemaType === 'array' ? schema[j] : schema,
            identifier,
            j,
            audienceMember
          );
        });
      }
    });
  }

  return mappedData;
}

function getDataForAudienceDataUpload(data) {
  const mappedData = {
    payload: {}
  };

  addAudienceMembersData(data, mappedData);
  hashDataIfNeeded(mappedData);

  return mappedData;
}

function validateMappedData(data, destinations, mappedData) {
  if (!mappedData.payload.schema || mappedData.payload.schema.length === 0) {
    return 'The Audience Members Identifiers Schema must be specified.';
  }

  if (!mappedData.payload.data || mappedData.payload.data.length === 0) {
    return 'At least 1 Audience Member must be specified.';
  }

  const audienceMembersLengthLimit = 10000;
  if (mappedData.payload.data.length > audienceMembersLengthLimit) {
    return (
      'Audience Members list length must be at most ' +
      audienceMembersLengthLimit +
      '. Current is: ' +
      mappedData.payload.data.length
    );
  }

  const lookalikeValueIndex = mappedData.payload.schema.indexOf('LOOKALIKE_VALUE');
  const lookalikeValueInSchema = lookalikeValueIndex !== -1;

  const lookalikeIsTheOnlyIdentifier =
    lookalikeValueInSchema && mappedData.payload.schema.length === 1;
  if (lookalikeIsTheOnlyIdentifier) {
    return 'Lookalike Value cannot be the only identifier in the schema.';
  }

  const action = data.audienceAction;
  if (action === 'ingest' || action === 'remove') {
    const someAudienceIsValueBased = destinations.some((destination) => destination.isValueBased);

    if (someAudienceIsValueBased) {
      const lookalikeValueIsInvalid = mappedData.payload.data.some((audienceMember) => {
        const lookalikeValue = makeNumber(audienceMember[lookalikeValueIndex]);
        return !isValidValue(lookalikeValue);
      });
      if (!lookalikeValueInSchema || lookalikeValueIsInvalid) {
        return 'Some Audience is Lookalike but the Lookalike Value is invalid.';
      }
    }
  }
}

function getDestinations(data) {
  const ownAuthFlow = data.authFlow === 'own';
  const action = data.audienceAction;
  if (action === 'ingest' || action === 'remove') {
    return ownAuthFlow ? data.ownAuthAudiencesList : data.stapeAuthAudiencesList;
  } else if (action === 'removeFromAll') {
    return ownAuthFlow ? data.ownAuthAdAccountsList : data.stapeAuthAdAccountsList;
  }
}

function transformDestinationsForStapeAuthFlow(data, destinations) {
  const action = data.audienceAction;
  if (action === 'ingest' || action === 'remove') {
    const transformedDestinations = destinations.reduce((acc, curr) => {
      const position = curr.isValueBased ? 1 : 0;
      acc[position] = acc[position] || {
        isValueBased: curr.isValueBased ? true : false,
        audienceIds: []
      };
      acc[position].audienceIds.push(makeString(curr.audienceId));
      return acc;
    }, {});
    return Object.values(transformedDestinations);
  } else if (action === 'removeFromAll') {
    return [
      {
        adAccountIds: destinations.map((adAccount) => {
          return makeString(adAccount.adAccountId);
        })
      }
    ];
  }
}

function generateRequestUrl(data, config) {
  const getAudiencePathByActionAndAuthFlow = (data) => {
    const authFlow = data.authFlow;
    const action = data.audienceAction;
    switch (action) {
      case 'ingest':
        if (authFlow === 'own') return '/' + enc(config.audienceId) + '/users';
        return '/audiences/users-add';
      case 'remove':
        if (authFlow === 'own') return '/' + enc(config.audienceId) + '/users';
        return '/audiences/users-remove';
      case 'removeFromAll':
        if (authFlow === 'own') return '/act_' + enc(config.adAccountId) + '/usersofanyaudience';
        return '/adaccounts/audiences-users-remove';
    }
  };

  if (data.authFlow === 'own') {
    const baseUrl = 'https://graph.facebook.com/v' + API_VERSION;
    const audiencePath = getAudiencePathByActionAndAuthFlow(data);
    const requestUrl = baseUrl + audiencePath + '?access_token=' + enc(config.accessToken);
    return requestUrl;
  }

  const containerIdentifier = getRequestHeader('x-gtm-identifier');
  const defaultDomain = getRequestHeader('x-gtm-default-domain');
  const containerApiKey = getRequestHeader('x-gtm-api-key');

  const audiencePath = getAudiencePathByActionAndAuthFlow(data);
  return (
    'https://' +
    enc(containerIdentifier) +
    '.' +
    enc(defaultDomain) +
    '/stape-api/' +
    enc(containerApiKey) +
    '/v1/meta' +
    audiencePath
  );
}

function generateRequestOptions(data) {
  const requestMethodByActionAndAuthFlow = {
    ingest: { own: 'POST', stape: 'POST' },
    remove: { own: 'DELETE', stape: 'POST' },
    removeFromAll: { own: 'DELETE', stape: 'POST' }
  };
  const requestMethod = requestMethodByActionAndAuthFlow[data.audienceAction][data.authFlow];

  const options = {
    method: requestMethod,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (data.authFlow === 'stape') {
    options.headers['x-meta-api-version'] = API_VERSION;
    options.timeout = 20000;
  }

  return options;
}

function sendRequests(data, destinations, mappedData) {
  const requestOptions = generateRequestOptions(data);

  if (data.authFlow === 'stape') {
    destinations = transformDestinationsForStapeAuthFlow(data, destinations);
  }

  const someAudienceIsNotValueBased = destinations.some((destination) => !destination.isValueBased);
  const lookalikeValueIndex = mappedData.payload.schema.indexOf('LOOKALIKE_VALUE');
  const lookalikeValueInSchema = lookalikeValueIndex !== -1;
  // Discard LOOKALIKE_VALUE from the payload for non-value-based audiences.
  let mappedDataWithoutLookalikeValue;
  if (someAudienceIsNotValueBased && lookalikeValueInSchema) {
    mappedDataWithoutLookalikeValue = JSON.parse(JSON.stringify(mappedData));
    mappedDataWithoutLookalikeValue.payload.schema.splice(lookalikeValueIndex, 1);
    mappedDataWithoutLookalikeValue.payload.data.forEach((audienceMember) => {
      audienceMember.splice(lookalikeValueIndex, 1);
    });
  }

  const requests = destinations.map((destination) => {
    const mappedDataForDestination =
      !destination.isValueBased && lookalikeValueInSchema
        ? mappedDataWithoutLookalikeValue
        : mappedData;
    const config =
      data.authFlow === 'own'
        ? {
            audienceId: destination.audienceId,
            adAccountId: destination.adAccountId,
            accessToken: destination.accessToken
          }
        : undefined;
    const requestUrl = generateRequestUrl(data, config);

    // Not part of the Meta API spec. Only used for Stape Connection.
    if (data.authFlow === 'stape') {
      if (data.audienceAction === 'ingest' || data.audienceAction === 'remove') {
        mappedDataForDestination.audienceIds = destination.audienceIds;
      } else if (data.audienceAction === 'removeFromAll') {
        mappedDataForDestination.adAccountIds = destination.adAccountIds;
      }
    }

    let message = '';
    const audienceIds = destination.audienceId || destination.audienceIds;
    const adAccountIds = destination.adAccountId || destination.adAccountIds;
    if (audienceIds) message = ' Audience ID(s): ' + audienceIds;
    else if (adAccountIds) message = ' Ad Account ID(s): ' + adAccountIds;

    return sendHttpRequest(requestUrl, requestOptions, JSON.stringify(mappedDataForDestination))
      .then((result) => {
        if (result.statusCode < 200 || result.statusCode >= 300) return false;
        return true;
      })
      .catch(() => {
        return false;
      });
  });

  Promise.all(requests)
    .then((results) => {
      if (!useOptimisticScenario) {
        const someRequestFailed = results.some((success) => !success);
        if (someRequestFailed) return data.gtmOnFailure();
        else return data.gtmOnSuccess();
      }
    })
    .catch(() => {
      if (!useOptimisticScenario) return data.gtmOnFailure();
    });
}

/*==============================================================================
  Helpers
==============================================================================*/

function shouldExitEarly(data, eventData) {
  if (!isConsentGivenOrNotRequired(data, eventData)) return true;

  const url = eventData.page_location || getRequestHeader('referer');
  if (url && url.lastIndexOf('https://gtm-msr.appspot.com/', 0) === 0) return true;

  return false;
}

function enc(data) {
  if (['null', 'undefined'].indexOf(getType(data)) !== -1) data = '';
  return encodeUriComponent(makeString(data));
}

function parseSchemaInput(input) {
  const type = getType(input);
  if (!isValidValue(input)) return;
  else if (type === 'array') return input.filter((e) => e);
  else if (type === 'string') {
    return input.split(',');
  }
}

function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return phoneNumber;
  return phoneNumber
    .split('+')
    .join('')
    .split(' ')
    .join('')
    .split('-')
    .join('')
    .split('(')
    .join('')
    .split(')')
    .join('');
}

function removeWhiteSpace(input) {
  if (!input) return input;
  return input.split(' ').join('');
}

function isHashed(value) {
  if (!value) return false;
  return makeString(value).match('^[A-Fa-f0-9]{64}$') !== null;
}

function hashData(value) {
  if (!value) return value;

  const type = getType(value);

  if (value === 'undefined' || value === 'null') return undefined;

  if (type === 'array') {
    return value.map((val) => hashData(val));
  }

  if (type === 'object') {
    return Object.keys(value).reduce((acc, val) => {
      acc[val] = hashData(value[val]);
      return acc;
    }, {});
  }

  if (isHashed(value)) return value;

  return sha256Sync(makeString(value).trim().toLowerCase(), {
    outputEncoding: 'hex'
  });
}

function normalizeBasedOnSchemaKey(schemaKey, identifier) {
  if (schemaKey === 'PHONE') return normalizePhoneNumber(identifier);
  else if (schemaKey === 'CT' || schemaKey === 'ST' || schemaKey === 'ZIP') {
    return removeWhiteSpace(identifier);
  } else return identifier;
}

function isValidValue(value) {
  const valueType = getType(value);
  return valueType !== 'null' && valueType !== 'undefined' && value !== '' && value === value;
}

function isUIFieldTrue(field) {
  return [true, 'true'].indexOf(field) !== -1;
}

function itemizeInput(input) {
  const type = getType(input);
  if (type === 'array') return input.filter((e) => e);
  else if (type === 'string') return [input];
  return [];
}

function isConsentGivenOrNotRequired(data, eventData) {
  if (data.adStorageConsent !== 'required') return true;
  if (eventData.consent_state) return !!eventData.consent_state.ad_storage;
  const xGaGcs = eventData['x-ga-gcs'] || ''; // x-ga-gcs is a string like "G110"
  return xGaGcs[2] === '1';
}

function log(rawDataToLog) {
  rawDataToLog.TraceId = getRequestHeader('trace-id');
  logToConsole(JSON.stringify(rawDataToLog));
}
