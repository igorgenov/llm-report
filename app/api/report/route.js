import { generateReport } from '../../../lib/llm-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { urls } = await request.json();
    const report = await generateReport(urls || '');
    return Response.json(report);
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Не удалось собрать отчёт.' },
      { status: 500 }
    );
  }
}
