import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import { DatadogInstance } from './DatadogInstance';


/**
 * The environment of the lambda function. If set to "local", the expectation is that the code is running on Localstack
 * therefore the tsBuildOutputFolder is required and the code will be loaded from there with hot reloading support.
 */
export type ENV = 'local' | 'personal' | 'dev' | 'uat' | 'prod' | string;


export type NodejsFunctionProps = Exclude<cdk.aws_lambda_nodejs.NodejsFunctionProps, 'code'|'handler'|'entry'|'environment'> & {
    /**
     * The absolute path to the root folder of the build output.
     * This is only required if isLocalStack is true.
     */
    tsBuildOutputFolder?: string;
    /**
     * The absolute path to the root of the source code where the method is located.
     * All code under this path will be available to the lambda function.
     * It is expected that this path will be built to the tsBuildOutputFolder.
     */
    sourcePath: string;
    /**
     * The relative path to the handler file from the base path e.g. some/folder/myFunction.ts
     * other than the `.ts` extension, this should be the same as the relative path to the handler in the tsBuildOutputFolder
     */
    relativePathToHandler: string;

    /**
     * Key-value pairs that Lambda caches and makes available for your Lambda
     * functions. Use environment variables to apply configuration changes, such
     * as test and production environment configurations, without changing your
     * Lambda function source code.
     *
     * @default - No environment variables.
     */
    readonly environment: { ENV: ENV } & {
        [key: string]: string;
    };
}

/**
 * Helper class to create a NodejsFunction with hot reloading support when running in localstack mode.
 */
export class NodejsFunction {
    private static hotReloadBucket: cdk.aws_s3.IBucket;
    public static generate(scope: Construct, id: string, props: NodejsFunctionProps): cdk.aws_lambda_nodejs.NodejsFunction {
        const {environment, tsBuildOutputFolder, sourcePath, relativePathToHandler, ...propsRest} = props;
        let lambdaProps : cdk.aws_lambda_nodejs.NodejsFunctionProps;

        const parsedHandlerPath = path.parse(relativePathToHandler);

        if (environment.ENV === 'local') {
            if (!tsBuildOutputFolder) {
                throw new Error('tsBuildOutputFolder is required when isLocalStack is true');
            }

            NodejsFunction.hotReloadBucket ||= cdk.aws_s3.Bucket.fromBucketName(scope, 'HotReloadBucket', 'hot-reload')
            lambdaProps = {
                ...propsRest,
                code: cdk.aws_lambda.Code.fromBucket(NodejsFunction.hotReloadBucket, tsBuildOutputFolder),
                handler: path.join(parsedHandlerPath.dir.substring(parsedHandlerPath.root.length), `${parsedHandlerPath.name}.handler`),
            }
        } else {
            lambdaProps = {
                ...propsRest,
                entry: path.join(sourcePath, parsedHandlerPath.dir, parsedHandlerPath.base),
                environment
            }
        }
        
        const lambda = new cdk.aws_lambda_nodejs.NodejsFunction(scope, id, lambdaProps);
        DatadogInstance.getInstance(scope, props.environment.ENV).addLambdaFunctions([lambda]);

        return lambda;
    }
}
