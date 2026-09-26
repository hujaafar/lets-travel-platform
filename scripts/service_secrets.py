"""Merge local provisioning values without overwriting owner integration secrets."""


def service_configuration(service, config, existing):
    data = {**existing, 'DB_PASSWORD': config[service], 'SERVICE_KEY': config['SERVICE_KEY']}
    if service == 'identity':
        data['ADMIN_PASSWORD'] = config['ADMIN_PASSWORD']
    if service == 'travel':
        data.setdefault('ELASTIC_USERNAME', 'travel-indexer')
        data.setdefault('ELASTIC_PASSWORD', config.get('ELASTIC_TRAVEL_PASSWORD', ''))
        # An operator may have configured a restricted user on a supported
        # external Neo4j deployment. Rerunning local bootstrap must not replace
        # that user's password with the local Community administrator password.
        data.setdefault('NEO4J_PASSWORD', config['NEO4J_PASSWORD'])
    return data
