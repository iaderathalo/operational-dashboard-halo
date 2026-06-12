import ResilientHttpConfigDefault from './ResilientHttpConfigDefault';

/**
 * Represents an entry in the collection of overrides within the ResilientHttpConfig.
 */
export default interface ResilientHttpConfigOverride extends ResilientHttpConfigDefault {
    /**
     * The regular expressions to match against the request URL.
     */
    urlRegexes: Array<RegExp | string>;
}
