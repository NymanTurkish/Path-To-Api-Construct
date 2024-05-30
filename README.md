# Path-To-Api-Construct
You must build before making a PR!

## Change Log
### v0.3
- Adds two new props, lambdaMemorySize and authorizerMemorySize, to apiProps
- Allows the user to add any needed function overrides inside of the method config by using `functionProps`. For example, if you wanted to change the memorySize of a specific lambda:
```ts
export const config : methodConfig = {
  methods: {
    'GET': {
      model: {
        requestParameters: {
          'method.request.querystring.exchangeId': true,
          'method.request.querystring.startTime': true
        }
      },
      authRequired: true,
      authorizer: 'salesforce-authorizer',
      functionProps: {
        memorySize: 512
      }
    }
  }
}
```
- Actually building the previous two releases...

### v0.2
- Adds the ability to support multiple authorizers
  - To use a specific authorizer, add the name of the authorizer (without the `.ts` suffix) to the options file for the method:
  ```ts
  export const config : methodConfig = {
    methods: {
      'GET': {
        model: {
          requestParameters: {
            'method.request.querystring.exchangeId': true,
            'method.request.querystring.startTime': true
          }
        },
        authRequired: true,
        authorizer: 'salesforce-authorizer'
      }
    }
  }
  ```
  - If not specificed, the `default-authorizer` will be used
#### Breaking Changes
- Existing `authorizer.ts` files MUST be renamed to `default-authorizer.ts`

### v0.1
- Current version
