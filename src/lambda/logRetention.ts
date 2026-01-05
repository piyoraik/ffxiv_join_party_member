import { CloudWatchLogsClient, CreateLogGroupCommand, PutRetentionPolicyCommand } from "@aws-sdk/client-cloudwatch-logs";

type CloudFormationCustomResourceEvent = {
  RequestType: "Create" | "Update" | "Delete";
  ResponseURL: string;
  StackId: string;
  RequestId: string;
  LogicalResourceId: string;
  PhysicalResourceId?: string;
  ResourceProperties: {
    ServiceToken: string;
    LogGroupName: string;
    RetentionInDays: number | string;
  };
};

async function sendResponse(params: {
  event: CloudFormationCustomResourceEvent;
  status: "SUCCESS" | "FAILED";
  reason?: string;
  physicalResourceId: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const body = JSON.stringify({
    Status: params.status,
    Reason: params.reason ?? "",
    PhysicalResourceId: params.physicalResourceId,
    StackId: params.event.StackId,
    RequestId: params.event.RequestId,
    LogicalResourceId: params.event.LogicalResourceId,
    Data: params.data ?? {}
  });

  const response = await fetch(params.event.ResponseURL, {
    method: "PUT",
    headers: {
      "content-type": "",
      "content-length": String(Buffer.byteLength(body))
    },
    body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Failed to send CloudFormation response: ${response.status} ${response.statusText}${text ? `: ${text}` : ""}`);
  }
}

function parseRetentionInDays(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("RetentionInDays must be a positive integer.");
  return parsed;
}

/**
 * CloudFormation Custom Resource:
 * 指定LogGroupを（存在しなければ作成し）Retentionを設定します。
 *
 * 既存LogGroupをCloudFormation管理下に置かず、保持期間だけを安全に変更する目的です。
 */
export const handler = async (event: CloudFormationCustomResourceEvent): Promise<void> => {
  const logGroupName = event.ResourceProperties.LogGroupName;
  const retentionInDays = parseRetentionInDays(event.ResourceProperties.RetentionInDays);
  const physicalResourceId = event.PhysicalResourceId ?? `log-retention:${logGroupName}`;

  try {
    if (event.RequestType === "Delete") {
      await sendResponse({
        event,
        status: "SUCCESS",
        physicalResourceId
      });
      return;
    }

    const client = new CloudWatchLogsClient({});

    try {
      await client.send(new CreateLogGroupCommand({ logGroupName }));
    } catch (error: any) {
      // 既に存在する場合は無視
      if (error?.name !== "ResourceAlreadyExistsException") throw error;
    }

    await client.send(new PutRetentionPolicyCommand({ logGroupName, retentionInDays }));

    await sendResponse({
      event,
      status: "SUCCESS",
      physicalResourceId,
      data: { LogGroupName: logGroupName, RetentionInDays: retentionInDays }
    });
  } catch (error: any) {
    await sendResponse({
      event,
      status: "FAILED",
      physicalResourceId,
      reason: error?.message ?? String(error)
    });
  }
};

