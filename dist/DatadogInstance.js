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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatadogInstance = exports.DATADOG_API_KEY_SECRET_NAME = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const datadog_cdk_constructs_v2_1 = require("datadog-cdk-constructs-v2");
exports.DATADOG_API_KEY_SECRET_NAME = 'datadog/api_key';
/**
 * Singleton class to create a Datadog instance.
 */
class DatadogInstance {
    constructor(scope, env) {
        this.datadogApiSecret = cdk.aws_secretsmanager.Secret.fromSecretNameV2(scope, 'Datadog API Key', exports.DATADOG_API_KEY_SECRET_NAME);
        this.datadog = new datadog_cdk_constructs_v2_1.Datadog(scope, "Datadog", {
            nodeLayerVersion: 113,
            extensionLayerVersion: 62,
            site: "us5.datadoghq.com",
            env: env,
            captureLambdaPayload: true,
            apiKeySecretArn: this.datadogApiSecret.secretArn,
        });
    }
    static getInstance(scope, env) {
        if (!DatadogInstance.DatadogInstance) {
            DatadogInstance.DatadogInstance = new DatadogInstance(scope, env);
        }
        return DatadogInstance.DatadogInstance;
    }
    addLambdaFunctions(lambdas) {
        lambdas.forEach((lam) => this.datadogApiSecret.grantRead(lam));
        this.datadog.addLambdaFunctions(lambdas);
    }
}
exports.DatadogInstance = DatadogInstance;
//# sourceMappingURL=DatadogInstance.js.map