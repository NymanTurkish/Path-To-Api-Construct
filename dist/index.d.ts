import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
export interface methodConfig {
    methods: {
        [method: string]: {
            authRequired: boolean;
            model: any;
        };
    };
}
interface domainConfig {
    name: string;
    certificate: cdk.aws_certificatemanager.Certificate;
}
interface apiProps {
    apiFolderPath: string;
    clientHostUrl: string;
    environment?: {
        [key: string]: string;
    };
    domainConfig?: domainConfig;
}
export declare class CustomAPI extends Construct {
    authorizer: apigateway.RequestAuthorizer;
    environment?: {
        [key: string]: string;
    };
    adminRole: iam.Role;
    constructor(scope: Construct, id: string, props: apiProps);
    addMethod: (type: string, resource: apigateway.IResource, pathToMethod: string, config: any, entry: string) => Promise<void>;
    pathToCamelCase: (path: string) => string;
}
export {};
