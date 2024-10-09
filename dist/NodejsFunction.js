"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodejsFunction = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const path = __importStar(require("path"));
const DatadogInstance_1 = require("./DatadogInstance");
/**
 * Helper class to create a NodejsFunction with hot reloading support when running in localstack mode.
 */
class NodejsFunction {
    static generate(scope, id, props) {
        const { environment, tsBuildOutputFolder, sourcePath, relativePathToHandler } = props, propsRest = __rest(props, ["environment", "tsBuildOutputFolder", "sourcePath", "relativePathToHandler"]);
        let lambdaProps;
        const parsedHandlerPath = path.parse(relativePathToHandler);
        if (environment.ENV === 'local') {
            if (!tsBuildOutputFolder) {
                throw new Error('tsBuildOutputFolder is required when isLocalStack is true');
            }
            NodejsFunction.hotReloadBucket || (NodejsFunction.hotReloadBucket = cdk.aws_s3.Bucket.fromBucketName(scope, 'HotReloadBucket', 'hot-reload'));
            lambdaProps = Object.assign(Object.assign({}, propsRest), { code: cdk.aws_lambda.Code.fromBucket(NodejsFunction.hotReloadBucket, tsBuildOutputFolder), handler: path.join(parsedHandlerPath.dir.substring(parsedHandlerPath.root.length), `${parsedHandlerPath.name}.handler`) });
        }
        else {
            lambdaProps = Object.assign(Object.assign({}, propsRest), { entry: path.join(sourcePath, parsedHandlerPath.dir, parsedHandlerPath.base), environment });
        }
        const lambda = new cdk.aws_lambda_nodejs.NodejsFunction(scope, id, lambdaProps);
        DatadogInstance_1.DatadogInstance.getInstance(scope, props.environment.ENV).addLambdaFunctions([lambda]);
        return lambda;
    }
}
exports.NodejsFunction = NodejsFunction;
//# sourceMappingURL=NodejsFunction.js.map