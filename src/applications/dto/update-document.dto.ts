export class UpdateDocumentDto {
  applicationId: string;
  documentType: 'resume' | 'coverLetter';
  documentData: Record<string, any> | string;
}
