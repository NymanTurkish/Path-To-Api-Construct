# Path-To-Api-Construct

## Change Log
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
