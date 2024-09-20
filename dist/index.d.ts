import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as nodejsLambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
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
interface apiRoute {
    routes: {
        [name: string]: apiRoute;
    };
    methods: {
        [method: string]: any;
    };
    resource: apigateway.IResource;
}
interface domainConfig {
    baseName?: string;
    name: string;
    certificate: cdk.aws_certificatemanager.Certificate;
}
export interface apiProps {
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
    functionProps?: nodejsLambda.NodejsFunctionProps;
    /**
     * Whether we are deploying to localstack. When true, hot reloading is enabled and the `tsBaseOutputFolder` and `tsApiOutputFolder` must be provided.
     */
    isLocalStack?: boolean;
    /**
     * The absolute path of the base ts output folder. When isLocalStack is true, this is required.
     */
    tsBaseOutputFolder?: string;
    /**
     * The absolute path of the transpiled api folder. When isLocalStack is true, this is required.
     */
    tsApiOutputFolder?: string;
}
export declare class CustomAPI extends Construct {
    authorizers: {
        [key: string]: apigateway.RequestAuthorizer;
    };
    lambdas: {
        [key: string]: lambda.Function;
    };
    environment?: {
        [key: string]: string;
    };
    clientHostUrl?: string;
    adminRole: iam.Role;
    lambdaMemorySize: number;
    authorizerMemorySize: number;
    apiGateway: cdk.aws_apigateway.RestApi;
    lambdasReady: Promise<void>;
    localstackHotReloadBucket: cdk.aws_s3.IBucket;
    private lambdasReadyResolve;
    constructor(scope: Construct, id: string, props: apiProps);
    /**
     * Returns the lambda entry point.
     * If we are in localstack mode, we need to use the tsBaseOutputFolder and the handler will be the entry point.ts file.
     * This allows for hot reloading and ensures that code above the api base folder is available for import
     * If we are not in localstack mode, we can use the path to the method.
     * @param props
     * @param pathToMethod
     * @param entryPoint
     * @returns
     */
    private getLambdaEntryPoint;
    traverse: (currentPath: string, currentNode: apiRoute, props: apiProps, parentName?: string) => Promise<void>;
    addMethod: (type: string, resource: apigateway.IResource, pathToMethod: string, config: any, methodName: string, props: apiProps) => Promise<void>;
    pathToCamelCase: (path: string) => string;
}
export {};
