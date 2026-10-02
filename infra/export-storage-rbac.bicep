// Grants a Cost Management export's managed identity write access to the hub storage account.
// Deployed at resource-group scope, in the subscription/RG where the storage account lives.
targetScope = 'resourceGroup'

@description('Storage account name (must exist in this resource group)')
param storageAccountName string

@description('principalId of the Cost Management export system-assigned identity')
param exportPrincipalId string

@description('Unique suffix so this can be deployed once per export without name collisions')
param roleAssignmentSuffix string

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

resource storageBlobDataContributorRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' existing = {
  scope: subscription()
  name: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe' // Storage Blob Data Contributor
}

resource exportRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, exportPrincipalId, roleAssignmentSuffix)
  scope: storage
  properties: {
    roleDefinitionId: storageBlobDataContributorRole.id
    principalId: exportPrincipalId
    principalType: 'ServicePrincipal'
  }
}
