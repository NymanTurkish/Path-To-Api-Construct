import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
export type NodejsFunctionProps = Exclude<cdk.aws_lambda_nodejs.NodejsFunctionProps, 'code' | 'handler' | 'entry'> & {
    /**
     * Whether we're running in localstack mode.
     * If true, the code and handler will be loaded from the tsBuildOutputFolder and hot reloading will be enabled.
     */
    isLocalStack?: boolean;
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
};
/**
 * Helper class to create a NodejsFunction with hot reloading support when running in localstack mode.
 */
export declare class NodejsFunction {
    private static hotReloadBucket;
    static generate(scope: Construct, id: string, props: NodejsFunctionProps): cdk.aws_lambda_nodejs.NodejsFunction;
}
