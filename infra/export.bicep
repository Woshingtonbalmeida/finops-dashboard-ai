// Daily FOCUS Cost Management export for a single subscription.
// Deployed at subscription scope (az deployment sub create --subscription <target>).
targetScope = 'subscription'

@description('Name for the Cost Management export resource')
param exportName string

@description('Resource ID of the destination storage account (FinOps hub, may live in another subscription)')
param storageAccountId string

@description('Container name in the destination storage account')
param containerName string

@description('Root folder path inside the container for this subscription export')
param rootFolderPath string

@description('UTC start date/time for the export recurrence window (ISO 8601)')
param recurrenceStart string

@description('UTC end date/time for the export recurrence window (ISO 8601)')
param recurrenceEnd string

@description('Location required for the export managed identity')
param location string = 'eastus2'

resource costExport 'Microsoft.CostManagement/exports@2025-03-01' = {
  name: exportName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    schedule: {
      status: 'Active'
      recurrence: 'Daily'
      recurrencePeriod: {
        from: recurrenceStart
        to: recurrenceEnd
      }
    }
    format: 'Csv'
    deliveryInfo: {
      destination: {
        resourceId: storageAccountId
        container: containerName
        rootFolderPath: rootFolderPath
      }
    }
    definition: {
      type: 'FocusCost'
      timeframe: 'MonthToDate'
      dataSet: {
        granularity: 'Daily'
      }
    }
  }
}

output exportPrincipalId string = costExport.identity.principalId
output exportName string = costExport.name
