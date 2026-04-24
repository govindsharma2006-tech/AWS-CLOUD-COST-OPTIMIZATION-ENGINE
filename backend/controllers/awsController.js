const { CostExplorerClient, GetCostAndUsageCommand, GetCostForecastCommand } = require("@aws-sdk/client-cost-explorer");
const { EC2Client, DescribeInstancesCommand, DescribeVolumesCommand } = require("@aws-sdk/client-ec2");
const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3");
const { RDSClient, DescribeDBInstancesCommand } = require("@aws-sdk/client-rds");
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
const User = require("../models/User");
const Alert = require("../models/Alert");
const { encrypt, decrypt } = require("../utils/encrypt");
const sendEmail = require("../utils/sendEmail");

// ─── Per-user AWS client factory ─────────────────────────────────────────────
function getClients(user) {
  const creds = user?.awsConnected && user?.awsAccessKeyId
    ? { accessKeyId: decrypt(user.awsAccessKeyId), secretAccessKey: decrypt(user.awsSecretAccessKey) }
    : { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY };
  const region = (user?.awsConnected ? user.awsRegion : null) || process.env.AWS_REGION || "us-east-1";
  return {
    ceClient:  new CostExplorerClient({ region: "us-east-1", credentials: creds }),
    ec2Client: new EC2Client({ region, credentials: creds }),
    s3Client:  new S3Client({ region, credentials: creds }),
    rdsClient: new RDSClient({ region, credentials: creds }),
  };
}

// ─── Helper: Get current month date range ────────────────────────────────────
function getMonthRange() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const end   = now.toISOString().split("T")[0];
  if (start === end) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return { start: yesterday.toISOString().split("T")[0], end };
  }
  return { start, end };
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
const getDashboardData = async (req, res) => {
  const hasServerCreds = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  if (!req.user?.awsConnected && !hasServerCreds) {
    return res.status(200).json({ awsNotConnected: true });
  }

  try {
    const { start, end } = getMonthRange();
    const today = new Date();
    const { ceClient, ec2Client, s3Client, rdsClient } = getClients(req.user);

    // ── Prepare all requests to run concurrently ──────────────────────────────
    const costReq = ceClient.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: "MONTHLY", Metrics: ["UnblendedCost"],
    }));

    const svcReq = ceClient.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: "MONTHLY", Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
    }));

    const ec2Req = ec2Client.send(new DescribeInstancesCommand({}));
    const ebsReq = ec2Client.send(new DescribeVolumesCommand({}));
    const s3Req  = s3Client.send(new ListBucketsCommand({}));
    const rdsReq = rdsClient.send(new DescribeDBInstancesCommand({}));

    const thirtyFiveAgo = new Date(today); thirtyFiveAgo.setDate(today.getDate() - 35);
    const dailyReq = ceClient.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: thirtyFiveAgo.toISOString().split("T")[0], End: end },
      Granularity: "DAILY", Metrics: ["UnblendedCost"],
    }));

    const twelveAgo = new Date(today); twelveAgo.setMonth(today.getMonth() - 11); twelveAgo.setDate(1);
    const monthlyReq = ceClient.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: twelveAgo.toISOString().split("T")[0], End: end },
      Granularity: "MONTHLY", Metrics: ["UnblendedCost"],
    }));

    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const fStart = tomorrow.toISOString().split("T")[0];
    const fEnd   = nextMonth.toISOString().split("T")[0];
    let forecastReq = Promise.resolve(null);
    if (fStart < fEnd) {
      forecastReq = ceClient.send(new GetCostForecastCommand({
        TimePeriod: { Start: fStart, End: fEnd },
        Metric: "UNBLENDED_COST", Granularity: "MONTHLY",
      }));
    }

    const regionReq = ceClient.send(new GetCostAndUsageCommand({
      TimePeriod: { Start: start, End: end },
      Granularity: "MONTHLY", Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "REGION" }],
    }));

    // ── Execute concurrently ───────────────────────────────────────────────────
    const [
      costRes, svcRes, ec2Res, ebsRes, s3Res, rdsRes, dailyRes, monthlyRes, fRes, regionRes
    ] = await Promise.allSettled([
      costReq, svcReq, ec2Req, ebsReq, s3Req, rdsReq, dailyReq, monthlyReq, forecastReq, regionReq
    ]);

    // 1️⃣ Total cost
    let totalCost = "0.00";
    if (costRes.status === "fulfilled") {
      totalCost = parseFloat(costRes.value.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount || 0).toFixed(2);
    } else { console.warn("Total cost skipped:", costRes.reason?.message); }

    // 2️⃣ Cost by service
    let costByService = [];
    if (svcRes.status === "fulfilled") {
      costByService = (svcRes.value.ResultsByTime?.[0]?.Groups || [])
        .map(g => ({ name: g.Keys[0], cost: parseFloat(g.Metrics.UnblendedCost.Amount).toFixed(2) }))
        .sort((a, b) => b.cost - a.cost).slice(0, 6);
    } else { console.warn("Service cost skipped:", svcRes.reason?.message); }

    // 3️⃣ EC2 instances
    let ec2Count = 0, runningEC2 = 0, stoppedEC2 = 0, ec2Instances = [];
    if (ec2Res.status === "fulfilled") {
      const allInstances = ec2Res.value.Reservations?.flatMap(r => r.Instances) || [];
      ec2Count   = allInstances.length;
      runningEC2 = allInstances.filter(i => i.State?.Name === "running").length;
      stoppedEC2 = allInstances.filter(i => i.State?.Name === "stopped").length;
      ec2Instances = allInstances.map(i => ({
        id: i.InstanceId, name: i.Tags?.find(t => t.Key === "Name")?.Value || "—",
        type: i.InstanceType, state: i.State?.Name, launchTime: i.LaunchTime,
      })).slice(0, 25);
    } else { console.warn("EC2 skipped:", ec2Res.reason?.message); }

    // 4️⃣ EBS volumes
    let volumeCount = 0, unattachedVolumes = 0;
    if (ebsRes.status === "fulfilled") {
      const vols = ebsRes.value.Volumes || [];
      volumeCount       = vols.length;
      unattachedVolumes = vols.filter(v => v.State === "available").length;
    } else { console.warn("EBS skipped:", ebsRes.reason?.message); }

    // 5️⃣ S3 buckets
    let s3Count = 0;
    if (s3Res.status === "fulfilled") {
      s3Count = (s3Res.value.Buckets || []).length;
    } else { console.warn("S3 skipped:", s3Res.reason?.message); }

    // 6️⃣ RDS instances
    let rdsCount = 0;
    if (rdsRes.status === "fulfilled") {
      rdsCount = (rdsRes.value.DBInstances || []).length;
    } else { console.warn("RDS skipped:", rdsRes.reason?.message); }

    // 7️⃣ Daily costs
    let last7DaysCost = "0.00", dailyCosts = [];
    if (dailyRes.status === "fulfilled") {
      const dailyResults = dailyRes.value.ResultsByTime || [];
      dailyCosts = dailyResults.map(r => ({
        date: r.TimePeriod.Start, cost: parseFloat(r.Total.UnblendedCost.Amount).toFixed(4),
      }));
      last7DaysCost = dailyResults.slice(-7).reduce((s, r) => s + parseFloat(r.Total.UnblendedCost.Amount), 0).toFixed(2) || "0.00";
    } else { console.warn("Daily cost skipped:", dailyRes.reason?.message); }

    // 8️⃣ Monthly costs
    let monthlyCosts = [];
    if (monthlyRes.status === "fulfilled") {
      monthlyCosts = monthlyRes.value.ResultsByTime?.map(r => ({
        month: r.TimePeriod.Start.substring(0, 7), cost: parseFloat(r.Total.UnblendedCost.Amount).toFixed(2),
      })) || [];
    } else { console.warn("Monthly cost skipped:", monthlyRes.reason?.message); }

    // 9️⃣ Forecast
    let forecastedCost = "0.00";
    if (fRes.status === "fulfilled") {
      forecastedCost = parseFloat(fRes.value.Total?.Amount || 0).toFixed(2);
    } else { console.warn("Forecast skipped:", fRes.reason?.message); }

    // 🔟 Region costs
    let costByRegion = [];
    if (regionRes.status === "fulfilled") {
      const totalCostNum = parseFloat(totalCost);
      costByRegion = (regionRes.value.ResultsByTime?.[0]?.Groups || [])
        .map(g => ({
          name: g.Keys[0], cost: parseFloat(g.Metrics.UnblendedCost.Amount).toFixed(2),
          pct: totalCostNum > 0 ? Math.round((parseFloat(g.Metrics.UnblendedCost.Amount) / totalCostNum) * 100) : 0,
        })).sort((a, b) => b.cost - a.cost).slice(0, 4);
    } else { console.warn("Region cost skipped:", regionRes.reason?.message); }

    const totalResources   = ec2Count + volumeCount + s3Count + rdsCount;
    const estimatedSavings = (unattachedVolumes * 24 + stoppedEC2 * 15).toFixed(2);

    // ── Email alert check (throttled: once per 24h per alert) ─────────────────────────
    try {
      const userAlerts = await Alert.find({ userId: req.user._id, type: "alert" });
      const totalNum   = parseFloat(totalCost) || 0;
      const now        = new Date();
      for (const alert of userAlerts) {
        if (totalNum >= alert.threshold) {
          const hoursSinceLast = alert.lastEmailSent
            ? (now - new Date(alert.lastEmailSent)) / (1000 * 60 * 60)
            : Infinity;
          if (hoursSinceLast >= 24) {
            const user = req.user;
            await sendEmail({
              to:      user.email,
              subject: `⚠️ CloudLens: "${alert.name}" threshold exceeded`,
              html:    `<div style="font-family:sans-serif;padding:20px">
                          <h2 style="color:#ef4444">⚠️ Cost Alert Triggered</h2>
                          <p>Your current AWS spend of <strong>$${totalNum.toFixed(2)}</strong>
                          has exceeded the threshold of <strong>$${alert.threshold}</strong>
                          set for alert <em>"${alert.name}"</em>.</p>
                          <p style="color:#888;font-size:12px">Sent by CloudLens &mdash; AWS Cost Intelligence</p>
                        </div>`,
            });
            await Alert.findByIdAndUpdate(alert._id, { lastEmailSent: now });
          }
        }
      }
    } catch (emailErr) {
      console.warn("[Email Alert Check] Skipped:", emailErr.message);
    }

    res.json({
      totalCost,
      savings: estimatedSavings,
      resources: totalResources,
      openRecommendations: unattachedVolumes + stoppedEC2,
      ec2: { total: ec2Count, running: runningEC2, stopped: stoppedEC2, instances: ec2Instances },
      ebs: { total: volumeCount, unattached: unattachedVolumes },
      s3:  { buckets: s3Count },
      rds: { instances: rdsCount },
      costByService,
      costByRegion,
      dailyCosts,
      last7DaysCost,
      monthlyCosts,
      forecastedCost,
      awsAccountId: req.user?.awsAccountId || null,
      period: { start, end },
    });

  } catch (error) {
    console.error("AWS Dashboard Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch AWS data. Check your credentials and permissions.",
      error: error.message,
    });
  }
};

// ─── Save per-user AWS credentials ───────────────────────────────────────────
const saveAwsCredentials = async (req, res) => {
  const { accessKeyId, secretAccessKey, region } = req.body;
  if (!accessKeyId || !secretAccessKey) {
    return res.status(400).json({ success: false, message: "Access Key ID and Secret Access Key are required." });
  }
  // Test credentials with S3 list
  try {
    const testClient = new S3Client({
      region: region || "us-east-1",
      credentials: { accessKeyId, secretAccessKey },
    });
    await testClient.send(new ListBucketsCommand({}));
  } catch (e) {
    return res.status(400).json({ success: false, message: "Invalid AWS credentials: " + e.message });
  }

  // Fetch real AWS Account ID via STS
  let awsAccountId = "Unknown";
  try {
    const stsClient = new STSClient({
      region: region || "us-east-1",
      credentials: { accessKeyId, secretAccessKey },
    });
    const identity = await stsClient.send(new GetCallerIdentityCommand({}));
    awsAccountId = identity.Account || "Unknown";
  } catch (e) {
    console.warn("STS GetCallerIdentity failed:", e.message);
  }

  await User.findByIdAndUpdate(req.user._id, {
    awsAccessKeyId:     encrypt(accessKeyId),
    awsSecretAccessKey: encrypt(secretAccessKey),
    awsRegion:          region || "us-east-1",
    awsConnected:       true,
    awsAccountId:       awsAccountId,
  });
  res.json({ success: true, message: "AWS account connected successfully ✅", awsAccountId });
};

// ─── Disconnect user's AWS account ───────────────────────────────────────────
const disconnectAws = async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, {
    awsAccessKeyId:     null,
    awsSecretAccessKey: null,
    awsRegion:          null,
    awsConnected:       false,
  });
  res.json({ success: true, message: "AWS account disconnected." });
};

module.exports = { getDashboardData, saveAwsCredentials, disconnectAws };
