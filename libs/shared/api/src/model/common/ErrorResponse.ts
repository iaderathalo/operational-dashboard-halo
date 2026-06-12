/**
 * The format of API Error Responses as required by the API Standards.
 *
 * See https://mmcglobal.sharepoint.com/sites/EnterpriseArchitecture/SitePages/Developing-our-API-standards.aspx
 */
export default interface ErrorResponse {
    /**
     * A URI reference that identifies the problem type.
     */
    type: string;
    /**
     * A short, human-readable summary of the problem type.
     */
    title: string;
    /**
     * The HTTP status code.
     */
    status: string;
    /**
     * A human-readable explanation specific to this occurrence of the problem.
     */
    detail: string;
    /**
     * A URI reference that identifies the specific problem.
     */
    instance: string;
}
