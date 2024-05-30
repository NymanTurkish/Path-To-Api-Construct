import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
export interface methodConfig {
    methods: {
        [method: string]: {
            authRequired: boolean;
            authorizer?: string;
            model: any;
        };
    };
}
interface domainConfig {
    baseName?: string;
    name: string;
    certificate: cdk.aws_certificatemanager.Certificate;
}
interface apiProps {
    apiName: string;
    apiFolderPath: string;
    clientHostUrl?: string;
    environment?: {
        [key: string]: string;
    };
    domainConfig?: domainConfig;
    deployOptions?: apigateway.RestApiProps;
    lambdaMemorySize?: number;
    authorizerMemorySize?: number;
}
export declare class CustomAPI extends Construct {
    authorizers: {
        [key: string]: apigateway.RequestAuthorizer;
    };
    environment?: {
        [key: string]: string;
    };
    clientHostUrl?: string;
    adminRole: iam.Role;
    lambdaMemorySize: number;
    authorizerMemorySize: number;
    constructor(scope: Construct, id: string, props: apiProps);
    addMethod: (type: string, resource: apigateway.IResource, pathToMethod: string, config: any, entry: string, props: apiProps) => Promise<void>;
    pathToCamelCase: (path: string) => string;
}
export {};
